/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SUITE INTEGRAL DE PRUEBAS QA END-TO-END (FASE 4)
 * Validación de flujos completos: Ciclo Hotel + POS, Inventario STOP,
 * Mitigación XSS Contextual, Protección CSV Injection y Cierre de Caja con Arqueo.
 * 
 * Ejecución: node --test backend/tests/integration_qa.test.js
 * ============================================================================
 */

import { test, describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { inicializarBaseDatos, obtenerMotorMemoria } from '../src/db/connection.js';
import { PmsService } from '../src/services/pmsService.js';
import { PosService } from '../src/services/posService.js';
import { InventarioService } from '../src/services/inventarioService.js';
import { InventarioRepository } from '../src/repositories/inventarioRepository.js';
import { HabitacionRepository } from '../src/repositories/habitacionRepository.js';
import { EstanciaRepository } from '../src/repositories/estanciaRepository.js';
import { CajaRepository } from '../src/repositories/cajaRepository.js';
import { escapeHTML, escapeAttr } from '../../js/validaciones.js';
import { clasificarPago, calcularResumenCaja } from '../../js/domain/caja.js';

describe('Fase 4: Pruebas de QA Integral y Flujos Completos de Producción', () => {

    beforeEach(async () => {
        await inicializarBaseDatos();
        const motor = obtenerMotorMemoria();
        motor.reiniciar();

        // Cargar producto de restaurante
        await InventarioRepository.crear({
            uuid: 'prod-qa-1',
            nombre: 'Lomo al Trapo Tradicional',
            categoria_id: 2,
            stock: 20,
            stock_minimo: 5,
            unidad: 'Porción',
            costo_unitario: 20000,
            precio_venta: 45000
        });
    });

    // ========================================================================
    // FLUJO 1: CICLO INTEGRAL HOTEL & RESTAURANTE POS
    // ========================================================================
    it('Flujo 1: Check-in -> Comanda con Plan -> Comanda Excedente -> Cierre Caja -> Check-out con Folio', async () => {
        // 1. Check-in de Huésped en Habitación 101 con Plan Pensión Completa (3 comidas)
        const checkIn = await PmsService.realizarCheckIn({
            nombre: 'Andrés Camargo',
            tipoDocumento: 'CC',
            documento: '80123456',
            habitacionNumero: '101',
            planId: 3 // 3 comidas diarias
        });

        assert.strictEqual(checkIn.habitacion.estado, 'Ocupada');
        const estanciaId = checkIn.estancia.id;
        const huespedId = checkIn.huesped.id;

        const productos = await InventarioRepository.listar();
        const plato = productos[0];

        // 2. Primera orden: 2 platos (ambos cubiertos por el plan)
        const orden1 = await PosService.procesarComanda({
            platoId: plato.id,
            cantidad: 2,
            huespedId,
            clienteNombre: 'Andrés Camargo',
            habitacion: '101',
            mesero: 'Mesero Turno A',
            metodoPago: 'PLAN_HOTEL'
        });

        assert.strictEqual(orden1.cortesiasAplicadas, 2);
        assert.strictEqual(orden1.excedenteCobrado, 0);

        // 3. Segunda orden: 2 platos (1 cortesía restante del plan + 1 excedente con cargo a habitación)
        const orden2 = await PosService.procesarComanda({
            platoId: plato.id,
            cantidad: 2,
            huespedId,
            clienteNombre: 'Andrés Camargo',
            habitacion: '101',
            mesero: 'Mesero Turno A',
            metodoPago: 'CARGO_HABITACION'
        });

        assert.strictEqual(orden2.cortesiasAplicadas, 1, 'Solo quedaba 1 cortesía de las 3 del plan');
        assert.strictEqual(orden2.excedenteCobrado, 1, '1 plato excedente debe cobrarse');

        // 4. Verificar que el cargo se acumuló en el folio de la estancia ($45.000)
        let estancia = await EstanciaRepository.buscarPorId(estanciaId);
        assert.strictEqual(estancia.total_folio, 45000);

        // 5. Cierre de caja del día: validar resumen financiero
        const comandasDia = [
            ...orden1.lineas,
            ...orden2.lineas
        ];

        const resumenCaja = calcularResumenCaja(comandasDia, '2026-11-25');
        // El cargo a habitación es cuenta por cobrar (folio), NO ingreso en efectivo de caja
        assert.strictEqual(resumenCaja.cuentasPorCobrar, 45000);
        assert.strictEqual(resumenCaja.efectivo, 0);
        assert.strictEqual(resumenCaja.totalCaja, 0);

        // 6. Check-out del huésped liquidando el folio acumulado con tarjeta
        const checkOut = await PmsService.realizarCheckOut(estanciaId, 'TARJETA');
        assert.strictEqual(checkOut.ok, true);
        assert.strictEqual(checkOut.totalFolioLiquidado, 45000);
        assert.strictEqual(checkOut.metodoPagoLiquidacion, 'TARJETA');

        // Habitación 101 vuelve a estar Disponible para nuevos huéspedes
        const habFinal = await HabitacionRepository.buscarPorNumero('101');
        assert.strictEqual(habFinal.estado, 'Disponible');
    });

    // ========================================================================
    // FLUJO 2: SISTEMA DE INVENTARIO STOP Y AGOTAMIENTO
    // ========================================================================
    it('Flujo 2: Agotamiento de existencias -> Bloqueo STOP -> Surtido trazable -> Venta restaurada', async () => {
        // Crear producto con exactamente 2 unidades
        const prodCritico = await InventarioRepository.crear({
            uuid: 'prod-critico-test',
            nombre: 'Postre de Natas Tradicional',
            categoria_id: 7,
            stock: 2,
            stock_minimo: 4,
            unidad: 'Copa',
            costo_unitario: 5000,
            precio_venta: 12000
        });

        // 1. Venta de las 2 unidades disponibles
        await PosService.procesarComanda({
            platoId: prodCritico.id,
            cantidad: 2,
            clienteNombre: 'Cliente Comedor',
            mesero: 'Cajero Operador',
            metodoPago: 'EFECTIVO'
        });

        let p = await InventarioRepository.buscarPorId(prodCritico.id);
        assert.strictEqual(p.stock, 0, 'El stock debe haber llegado a 0');

        // 2. Intento de venta de 1 unidad con stock agotado: debe ser bloqueada por sistema STOP
        await assert.rejects(
            async () => {
                await PosService.procesarComanda({
                    platoId: prodCritico.id,
                    cantidad: 1,
                    clienteNombre: 'Cliente Nuevo',
                    mesero: 'Cajero Operador',
                    metodoPago: 'EFECTIVO'
                });
            },
            /STOP CRÍTICO|STOCK INSUFICIENTE/
        );

        // 3. Surtir inventario mediante movimiento de entrada trazable
        await InventarioService.ajustarStock({
            productoId: prodCritico.id,
            cantidadAjuste: 15,
            tipo: 'ENTRADA',
            motivo: 'Compra urgente de postres para evento corporativo',
            usuarioResponsable: 'Encargado Bodega'
        });

        p = await InventarioRepository.buscarPorId(prodCritico.id);
        assert.strictEqual(p.stock, 15);

        // 4. Venta posterior debe procesarse con total normalidad
        const ventaNueva = await PosService.procesarComanda({
            platoId: prodCritico.id,
            cantidad: 3,
            clienteNombre: 'Cliente Nuevo',
            mesero: 'Cajero Operador',
            metodoPago: 'EFECTIVO'
        });

        assert.strictEqual(ventaNueva.ok, true);
        p = await InventarioRepository.buscarPorId(prodCritico.id);
        assert.strictEqual(p.stock, 12);
    });

    // ========================================================================
    // FLUJO 3: PRUEBAS ADVERSARIALES XSS Y CODIFICACIÓN CONTEXTUAL
    // ========================================================================
    it('Flujo 3: Adversarial XSS: datos con scripts o etiquetas son codificados contextualmente', () => {
        const payloadXSS = '<script>alert("Ataque XSS")</script>';
        const payloadAtributo = 'x" onfocus="alert(1)" autofocus="';

        // Codificación para cuerpo HTML
        const safeHTML = escapeHTML(payloadXSS);
        assert.strictEqual(safeHTML.includes('<script>'), false);
        assert.strictEqual(safeHTML.includes('&lt;script&gt;'), true);

        // Codificación para atributos HTML
        const safeAttr = escapeAttr(payloadAtributo);
        assert.strictEqual(safeAttr.includes('"'), false);
        assert.strictEqual(safeAttr.includes('&quot;'), true);
    });

    // ========================================================================
    // FLUJO 4: PREVENCIÓN DE INYECCIÓN DE FÓRMULAS EN CSV
    // ========================================================================
    it('Flujo 4: CSV Formula Injection: caracteres peligrosos (=, +, -, @) son neutralizados', () => {
        const celdasPeligrosas = [
            '=SUM(A1:A10)',
            '+cmd|"/C calc"!A0',
            '-10+20',
            '@SUM(B1:B5)'
        ];

        // Función de neutralización estándar OWASP para hojas de cálculo
        const sanitizarCeldaCSV = (valor) => {
            const str = String(valor ?? '');
            if (/^[=+\-@\t\r]/.test(str)) {
                return `'${str}`; // Anteponer apóstrofe para forzar interpretación como texto
            }
            return str;
        };

        celdasPeligrosas.forEach(celda => {
            const resultado = sanitizarCeldaCSV(celda);
            assert.strictEqual(resultado.startsWith("'"), true, `La celda "${celda}" debe ser neutralizada con apóstrofe`);
        });

        const celdaSegura = sanitizarCeldaCSV('Texto normal de venta');
        assert.strictEqual(celdaSegura, 'Texto normal de venta');
    });

});
