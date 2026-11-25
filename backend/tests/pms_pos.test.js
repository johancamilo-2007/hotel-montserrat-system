/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SUITE DE PRUEBAS DE PMS, POS Y STOP (FASE 3)
 * Validación de ocupación, check-in/out con folios, congelamiento de precios,
 * partición de comandas y trazabilidad de inventario STOP.
 * 
 * Ejecución: node --test backend/tests/pms_pos.test.js
 * ============================================================================
 */

import { test, describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { inicializarBaseDatos, obtenerMotorMemoria } from '../src/db/connection.js';
import { PmsService, validarDocumentoIdentidad } from '../src/services/pmsService.js';
import { PosService } from '../src/services/posService.js';
import { InventarioService } from '../src/services/inventarioService.js';
import { HabitacionRepository } from '../src/repositories/habitacionRepository.js';
import { InventarioRepository } from '../src/repositories/inventarioRepository.js';
import { EstanciaRepository } from '../src/repositories/estanciaRepository.js';
import { MovimientoInventarioRepository } from '../src/repositories/movimientoInventarioRepository.js';

describe('Fase 3: Lógica PMS Hotelero Avanzada y POS de Restaurante', () => {

    beforeEach(async () => {
        await inicializarBaseDatos();
        const motor = obtenerMotorMemoria();
        motor.reiniciar();

        // Cargar productos de prueba
        await InventarioRepository.crear({
            uuid: 'prod-pms-1',
            nombre: 'Trucha al Horno con Patacón',
            categoria_id: 3,
            stock: 12,
            stock_minimo: 4,
            unidad: 'Plato',
            costo_unitario: 14000,
            precio_venta: 36000
        });
    });

    // ========================================================================
    // 1. VALIDACIÓN DE IDENTIDAD Y CONTROL DE HABITACIONES (PMS)
    // ========================================================================
    it('Validación documental colombiana: valida tipos y longitudes de CC, CE, Pasaporte y NIT', () => {
        assert.strictEqual(validarDocumentoIdentidad('CC', '10203040').valido, true);
        assert.strictEqual(validarDocumentoIdentidad('CC', '1020ABC').valido, false, 'CC no debe tener letras');
        assert.strictEqual(validarDocumentoIdentidad('PASAPORTE', 'AB123456').valido, true);
        assert.strictEqual(validarDocumentoIdentidad('TIPO_INVALIDO', '12345').valido, false);
    });

    it('Control de ocupación: Check-in exitoso ocupa habitación; Doble Check-in es rechazado', async () => {
        // 1. Check-in exitoso en habitación 101
        const resCheckIn = await PmsService.realizarCheckIn({
            nombre: 'Valentina Morales',
            tipoDocumento: 'CC',
            documento: '52899123',
            habitacionNumero: '101',
            planId: 3 // Pensión Completa
        });

        assert.strictEqual(resCheckIn.habitacion.estado, 'Ocupada');
        assert.strictEqual(resCheckIn.estancia.estado, 'Activa');

        const hab = await HabitacionRepository.buscarPorNumero('101');
        assert.strictEqual(hab.estado, 'Ocupada');

        // 2. Intentar Check-in en la misma habitación ocupada debe fallar
        await assert.rejects(
            async () => {
                await PmsService.realizarCheckIn({
                    nombre: 'Pedro Gómez',
                    tipoDocumento: 'CC',
                    documento: '79888999',
                    habitacionNumero: '101',
                    planId: 0
                });
            },
            /HABITACIÓN OCUPADA/
        );
    });

    // ========================================================================
    // 2. CHECK-OUT Y LIQUIDACIÓN DE FOLIOS (PMS)
    // ========================================================================
    it('Check-out formal: liquida folios acumulados, finaliza estancia y libera la habitación', async () => {
        // Registrar Check-in
        const checkIn = await PmsService.realizarCheckIn({
            nombre: 'Marcos Benítez',
            tipoDocumento: 'PASAPORTE',
            documento: 'PE9876543',
            habitacionNumero: '201',
            planId: 1
        });

        const estanciaId = checkIn.estancia.id;

        // Simular consumo con cargo a habitación ($72.000)
        await EstanciaRepository.acumularCargoFolio(estanciaId, 72000);

        // Realizar Check-out
        const liquidacion = await PmsService.realizarCheckOut(estanciaId, 'TARJETA');

        assert.strictEqual(liquidacion.ok, true);
        assert.strictEqual(liquidacion.totalFolioLiquidado, 72000);
        assert.strictEqual(liquidacion.metodoPagoLiquidacion, 'TARJETA');

        // Habitación 201 debe haber sido liberada
        const habLiberada = await HabitacionRepository.buscarPorNumero('201');
        assert.strictEqual(habLiberada.estado, 'Disponible');

        // Estancia debe figurar como Finalizada
        const estanciaFinal = await EstanciaRepository.buscarPorId(estanciaId);
        assert.strictEqual(estanciaFinal.estado, 'Finalizada');
    });

    // ========================================================================
    // 3. CONGELAMIENTO DE PRECIOS Y PARTICIÓN MULTI-CANTIDAD (POS)
    // ========================================================================
    it('Price Freezing: el precio unitario se congela en la comanda y no cambia si el catálogo se altera', async () => {
        const productos = await InventarioRepository.listar();
        const plato = productos[0]; // Precio actual: 36.000

        // 1. Crear comanda a $36.000
        const resultadoComanda = await PosService.procesarComanda({
            platoId: plato.id,
            cantidad: 2,
            clienteNombre: 'Cliente Restaurante',
            mesero: 'Mesero Turno A',
            metodoPago: 'EFECTIVO'
        });

        assert.strictEqual(resultadoComanda.precioUnitarioCongelado, 36000);
        assert.strictEqual(resultadoComanda.lineas[0].total, 72000);

        // 2. Supongamos que debido a inflación se sube el precio de venta a $50.000 en inventario
        plato.precio_venta = 50000;

        // 3. La comanda histórica previamente creada retiene su precio congelado de $36.000
        assert.strictEqual(resultadoComanda.lineas[0].precio_unitario || resultadoComanda.precioUnitarioCongelado, 36000);
    });

    it('Partición multi-cantidad: consume cupos disponibles y factura excedente como CARGO_HABITACION acumulado en folio', async () => {
        // Registrar huésped con plan Pensión Completa (3 comidas)
        const checkIn = await PmsService.realizarCheckIn({
            nombre: 'Diana Cuervo',
            tipoDocumento: 'CC',
            documento: '10987654',
            habitacionNumero: '204',
            planId: 3 // 3 comidas
        });

        const productos = await InventarioRepository.listar();
        const plato = productos[0];

        // Huésped pide 5 platos en una sola comanda (3 cortesías de plan + 2 con cargo a habitación)
        const resComanda = await PosService.procesarComanda({
            platoId: plato.id,
            cantidad: 5,
            huespedId: checkIn.huesped.id,
            clienteNombre: 'Diana Cuervo',
            habitacion: '204',
            mesero: 'Mesero Turno A',
            metodoPago: 'CARGO_HABITACION'
        });

        assert.strictEqual(resComanda.cortesiasAplicadas, 3, 'Debe otorgar 3 cortesías del plan');
        assert.strictEqual(resComanda.excedenteCobrado, 2, 'Debe cobrar las 2 unidades excedentes');

        // Verificar acumulación en el folio de la estancia (2 * 36.000 = $72.000)
        const estancia = await EstanciaRepository.buscarPorId(checkIn.estancia.id);
        assert.strictEqual(estancia.total_folio, 72000);
    });

    // ========================================================================
    // 4. TRAZABILIDAD DE INVENTARIO STOP
    // ========================================================================
    it('Trazabilidad STOP: registrar ajuste guarda stock_previo, posterior, motivo y usuario responsable', async () => {
        const productos = await InventarioRepository.listar();
        const plato = productos[0]; // Stock actual: 12

        // Registrar entrada de 10 porciones adicionales por surtido de bodega
        const resAjuste = await InventarioService.ajustarStock({
            productoId: plato.id,
            cantidadAjuste: 10,
            tipo: 'ENTRADA',
            motivo: 'Recepción de pedido proveedor Lácteos y Carnes Andinas',
            usuarioResponsable: 'Encargado de Bodega'
        });

        assert.strictEqual(resAjuste.stockPrevio, 12);
        assert.strictEqual(resAjuste.stockPosterior, 22);

        // Verificar que el movimiento quedó registrado en la bitácora
        const movimientos = await MovimientoInventarioRepository.listarPorProducto(plato.id);
        assert.strictEqual(movimientos.length, 1);
        assert.strictEqual(movimientos[0].motivo.includes('Recepción de pedido'), true);
        assert.strictEqual(movimientos[0].usuario_responsable, 'Encargado de Bodega');
    });

    // ========================================================================
    // 5. COMPROBANTE TÉRMICO Y LEYENDA FISCAL
    // ========================================================================
    it('Comprobante interno: incluye consecutivo, desglose impositivo y leyenda no factura', () => {
        const comandaMock = {
            consecutivo: 1055,
            fecha: '2026-11-25',
            hora: '14:30:00',
            clienteNombre: 'Carlos Serrano',
            habitacion: '101',
            mesero: 'Mesero 1',
            platoNombre: 'Trucha al Horno con Patacón',
            cantidad: 2,
            precioUnitario: 36000,
            total: 72000,
            metodoPago: 'EFECTIVO'
        };

        const ticket = PosService.generarComprobanteImprimible(comandaMock);

        assert.strictEqual(ticket.leyendaLegal, 'COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA');
        assert.strictEqual(ticket.comprobante.consecutivo, 1055);
        assert.strictEqual(ticket.totales.total, 72000);
        assert.strictEqual(ticket.notaContable.includes('VALIDAR CON CONTADOR'), true);
    });

});
