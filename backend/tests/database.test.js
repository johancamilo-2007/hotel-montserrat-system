/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SUITE DE PRUEBAS DE PERSISTENCIA Y ACID (FASE 2)
 * Pruebas de Transaccionalidad ACID, Rollback en Fallo, Prevención de SQLi
 * y Consistencia Referencial en Repositorios.
 * 
 * Ejecución: node --test backend/tests/database.test.js
 * ============================================================================
 */

import { test, describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { inicializarBaseDatos, ejecutarTransaccion, ejecutarQuery, obtenerMotorMemoria } from '../src/db/connection.js';
import { HuespedRepository } from '../src/repositories/huespedRepository.js';
import { InventarioRepository } from '../src/repositories/inventarioRepository.js';
import { ComandaRepository } from '../src/repositories/comandaRepository.js';
import { CajaRepository } from '../src/repositories/cajaRepository.js';

describe('Fase 2: Persistencia, Consultas Parametrizadas y Transacciones ACID', () => {

    beforeEach(async () => {
        // Reiniciar base de datos a estado limpio para cada test
        await inicializarBaseDatos();
        const motor = obtenerMotorMemoria();
        motor.reiniciar();

        // Cargar datos base de prueba
        await HuespedRepository.crear({
            uuid: 'hsp-test-1',
            nombre: 'Alejandro Restrepo',
            documento: 'CC-71234567',
            habitacion: 'Habitación 201',
            plan_id: 3 // Pensión Completa
        });

        await InventarioRepository.crear({
            uuid: 'inv-test-1',
            nombre: 'Filete de Salmón',
            categoria_id: 3,
            stock: 10,
            stock_minimo: 3,
            unidad: 'Porción',
            costo_unitario: 15000,
            precio_venta: 38000
        });
    });

    // ========================================================================
    // 1. PREVENCIÓN DE INYECCIÓN SQL (OWASP A03:2021 / ASVS V5.3)
    // ========================================================================
    it('SQLi Defense: las consultas parametrizadas tratan payloads de inyección como cadenas literales', async () => {
        const payloadSQLi = "' OR '1'='1' --";

        // Búsqueda por documento malicioso
        const huesped = await HuespedRepository.buscarPorDocumento(payloadSQLi);
        assert.strictEqual(huesped, null, 'No debe retornar registros si el valor no coincide literalmente');

        // Búsqueda de inyección clásica con comilla simple
        const comillaSQLi = "Robert'); DROP TABLE huespedes; --";
        const huesped2 = await HuespedRepository.buscarPorDocumento(comillaSQLi);
        assert.strictEqual(huesped2, null);

        // Verificar que la tabla no fue borrada
        const todos = await HuespedRepository.listarActivos();
        assert.strictEqual(todos.length, 1);
    });

    // ========================================================================
    // 2. ATOMICIDAD ACID - COMMIT EXITOSO
    // ========================================================================
    it('ACID Commit: una comanda exitosa descuenta stock, consume cupo y registra comanda de forma atómica', async () => {
        const huespedes = await HuespedRepository.listarActivos();
        const huespedId = huespedes[0].id;

        const productos = await InventarioRepository.listar();
        const platoId = productos[0].id;

        // Registrar comanda de 2 unidades
        const comanda = await ComandaRepository.registrarComandaTransaccional({
            uuid: 'com-acid-1',
            fecha: '2026-11-25',
            hora: '13:00:00',
            huespedId,
            clienteNombre: 'Alejandro Restrepo',
            habitacion: 'Habitación 201',
            mesa: 'Mesa 4',
            mesero: 'Carlos Mesero',
            comida: 'Almuerzo',
            platoId,
            platoNombre: 'Filete de Salmón',
            cantidad: 2,
            tipo: 'Cortesía (Plan)',
            metodoPago: 'PLAN_HOTEL',
            total: 0
        });

        assert.strictEqual(comanda.anulada, false);
        assert.strictEqual(comanda.mesero, 'Carlos Mesero');

        // Verificar descuento de existencias (10 - 2 = 8)
        const productoActualizado = await InventarioRepository.buscarPorId(platoId);
        assert.strictEqual(productoActualizado.stock, 8, 'El stock debe reducirse en exactamente 2 unidades');

        // Verificar consumo de cupo en el huésped (0 + 2 = 2)
        const huespedActualizado = await HuespedRepository.buscarPorId(huespedId);
        assert.strictEqual(huespedActualizado.comidas_hoy, 2, 'Comidas consumidas hoy debe registrar 2');
    });

    // ========================================================================
    // 3. ATOMICIDAD ACID - ROLLBACK ANTE ERROR
    // ========================================================================
    it('ACID Rollback: si el stock es insuficiente, se cancela la transacción y NINGÚN cambio persiste', async () => {
        const huespedes = await HuespedRepository.listarActivos();
        const huespedId = huespedes[0].id;

        const productos = await InventarioRepository.listar();
        const platoId = productos[0].id;

        // Intentar ordenar 15 unidades cuando solo hay 10 en stock
        await assert.rejects(
            async () => {
                await ComandaRepository.registrarComandaTransaccional({
                    uuid: 'com-acid-fail',
                    fecha: '2026-11-25',
                    hora: '14:00:00',
                    huespedId,
                    clienteNombre: 'Alejandro Restrepo',
                    platoId,
                    platoNombre: 'Filete de Salmón',
                    cantidad: 15, // SUPERIOR AL STOCK (10)
                    tipo: 'Cobro',
                    metodoPago: 'EFECTIVO',
                    mesero: 'Carlos Mesero',
                    total: 570000
                });
            },
            /STOCK INSUFICIENTE/
        );

        // Verificar que el ROLLBACK garantizó que el stock se mantiene intacto en 10
        const productoSinCambio = await InventarioRepository.buscarPorId(platoId);
        assert.strictEqual(productoSinCambio.stock, 10, 'El stock debe mantenerse intacto tras un rollback');

        // Verificar que no se incrementaron comidas del huésped
        const huespedSinCambio = await HuespedRepository.buscarPorId(huespedId);
        assert.strictEqual(huespedSinCambio.comidas_hoy, 0);

        // Verificar que ninguna comanda huérfana fue guardada
        const comandasHoy = await ComandaRepository.listarPorFecha('2026-11-25');
        assert.strictEqual(comandasHoy.length, 0, 'No debe existir ninguna comanda guardada');
    });

    // ========================================================================
    // 4. ANULACIÓN TRANSACCIONAL Y DEVOLUCIÓN DE INVENTARIO
    // ========================================================================
    it('Anulación Atómica: anular comanda revierte el inventario y marca estado anulado en una transacción', async () => {
        const productos = await InventarioRepository.listar();
        const platoId = productos[0].id;

        // 1. Crear comanda consumiendo 3 unidades (stock pasa de 10 a 7)
        const comanda = await ComandaRepository.registrarComandaTransaccional({
            uuid: 'com-anular-test',
            fecha: '2026-11-25',
            hora: '15:00:00',
            clienteNombre: 'Cliente Bar',
            platoId,
            platoNombre: 'Filete de Salmón',
            cantidad: 3,
            mesero: 'Operador Caja',
            metodoPago: 'EFECTIVO',
            total: 114000
        });

        let prod = await InventarioRepository.buscarPorId(platoId);
        assert.strictEqual(prod.stock, 7);

        // 2. Anular la comanda y devolver stock
        const res = await ComandaRepository.anularComandaTransaccional(
            comanda.id,
            'Error al digitar la mesa por el mesero',
            platoId,
            3
        );

        assert.strictEqual(res.ok, true);

        // 3. Verificar que el stock volvió a 10
        prod = await InventarioRepository.buscarPorId(platoId);
        assert.strictEqual(prod.stock, 10, 'El stock debe restituirse tras anulación');

        // 4. Verificar que la comanda figura como anulada
        const comandaActualizada = await ComandaRepository.buscarPorId(comanda.id);
        assert.strictEqual(comandaActualizada.anulada, 1);
        assert.strictEqual(comandaActualizada.motivo_anulacion.includes('Error al digitar'), true);
    });

    // ========================================================================
    // 5. REGISTRO Y PERSISTENCIA DE ARQUEO DE CAJA
    // ========================================================================
    it('Cierre de caja: persiste el arqueo físico y calcula diferencia contable', async () => {
        const cierre = await CajaRepository.registrarCierre({
            uuid: 'cie-test-1',
            fecha: '2026-11-25',
            hora: '22:00:00',
            usuarioResponsable: 'Cajero Principal',
            comandasTotales: 15,
            totalCaja: 450000,
            totalFolios: 120000,
            efectivoContado: 455000,
            diferencia: 5000, // Sobrante de $5.000
            motivoReapertura: null
        });

        assert.strictEqual(cierre.totalCaja, 450000);
        assert.strictEqual(cierre.totalFolios, 120000);
        assert.strictEqual(cierre.diferencia, 5000);

        const guardados = await CajaRepository.listarCierres();
        assert.strictEqual(guardados.length, 1);
    });

});
