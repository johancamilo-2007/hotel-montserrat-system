/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE COMANDAS Y VENTAS POS
 * Registro transaccional con descuento atómico de inventario y asignación de folios.
 * Mitigación AppSec: OWASP A03:2021 (SQLi) / A01:2021 (Atribución del operador)
 * ============================================================================
 */

import { ejecutarQuery, ejecutarTransaccion } from '../db/connection.js';
import { InventarioRepository } from './inventarioRepository.js';
import { HuespedRepository } from './huespedRepository.js';

export const ComandaRepository = {
    async buscarPorId(id, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM comandas WHERE id = ?',
            [id],
            tx
        );
        return filas[0] || null;
    },

    async listarPorFecha(fecha, tx = null) {
        return await ejecutarQuery(
            'SELECT * FROM comandas WHERE fecha = ?',
            [fecha],
            tx
        );
    },

    /**
     * Registra una comanda dentro de una transacción ACID garantizada:
     * 1. Descuenta existencias del producto en inventario.
     * 2. Si es para un huésped con cortesía de plan, actualiza comidas consumidas.
     * 3. Registra la comanda con atribución estricta del operador autenticado.
     * Si cualquiera de los 3 pasos falla, realiza ROLLBACK total automático.
     */
    async registrarComandaTransaccional({
        uuid,
        consecutivo = null,
        fecha,
        hora,
        huespedId = null,
        clienteNombre,
        habitacion = '',
        mesa = 'Mesa 1',
        mesero,
        comida,
        platoId,
        platoNombre,
        precioUnitario = 0,
        cantidad = 1,
        tipo = 'Cobro',
        metodoPago = 'EFECTIVO',
        total = 0
    }) {
        return await ejecutarTransaccion(async (tx) => {
            // Paso 1: Descontar stock atómicamente (lanza excepción si stock insuficiente)
            if (platoId) {
                await InventarioRepository.descontarStock(platoId, cantidad, tx);
            }

            // Paso 2: Si es cortesía y hay huésped asociado, actualizar comidas_hoy
            if (huespedId && tipo.includes('Cortesía')) {
                await HuespedRepository.incrementarComidasHoy(huespedId, cantidad, tx);
            }

            // Paso 3: Insertar comanda en base de datos parametrizada
            const res = await ejecutarQuery(
                `INSERT INTO comandas 
                (uuid, consecutivo, fecha, hora, huesped_id, cliente_nombre, habitacion, mesa, mesero, comida, plato_nombre, precio_unitario, cantidad, tipo, metodo_pago, total, anulada) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [
                    uuid,
                    consecutivo,
                    fecha,
                    hora,
                    huespedId,
                    clienteNombre,
                    habitacion,
                    mesa,
                    mesero,
                    comida,
                    platoNombre,
                    precioUnitario,
                    cantidad,
                    tipo,
                    metodoPago,
                    total
                ],
                tx
            );

            return {
                id: res.insertId,
                uuid,
                consecutivo,
                fecha,
                hora,
                huespedId,
                clienteNombre,
                mesero,
                platoNombre,
                precio_unitario: precioUnitario,
                precioUnitario,
                cantidad,
                tipo,
                metodoPago,
                total,
                anulada: false
            };
        });
    },

    /**
     * Anulación atómica de comanda:
     * 1. Marca la comanda como anulada con motivo.
     * 2. Repone el stock del producto automáticamente.
     */
    async anularComandaTransaccional(comandaId, motivo, platoId, cantidad) {
        return await ejecutarTransaccion(async (tx) => {
            const comanda = await this.buscarPorId(comandaId, tx);
            if (!comanda) {
                throw new Error(`[COMANDA ERROR] La comanda con ID ${comandaId} no existe.`);
            }

            if (comanda.anulada) {
                throw new Error('[COMANDA ERROR] La comanda ya se encuentra previamente anulada.');
            }

            // Marcar comanda como anulada
            await ejecutarQuery(
                'UPDATE comandas SET anulada = 1, motivo_anulacion = ? WHERE id = ?',
                [motivo, comandaId],
                tx
            );

            // Reponer existencias si se especificó el producto
            if (platoId && cantidad > 0) {
                await InventarioRepository.reponerStock(platoId, cantidad, tx);
            }

            return { ok: true, mensaje: `Comanda ${comandaId} anulada y stock devuelto exitosamente.` };
        });
    }
};
