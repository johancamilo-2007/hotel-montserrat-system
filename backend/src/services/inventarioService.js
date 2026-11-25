/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SERVICIO DE INVENTARIO Y SISTEMA STOP
 * Control de umbrales STOP dinámicos y registro inmutable de movimientos.
 * Mitigación AppSec: OWASP A09:2021 (Logging & Trazabilidad de existencias)
 * ============================================================================
 */

import { ejecutarTransaccion } from '../db/connection.js';
import { InventarioRepository } from '../repositories/inventarioRepository.js';
import { MovimientoInventarioRepository } from '../repositories/movimientoInventarioRepository.js';
import { estadoStock } from '../../../js/domain/inventario.js';

export const InventarioService = {
    /**
     * Ajusta el stock de un producto registrando la trazabilidad completa del movimiento.
     */
    async ajustarStock({
        productoId,
        cantidadAjuste, // Positivo para entrada, negativo para salida
        tipo = 'AJUSTE', // 'ENTRADA' | 'SALIDA' | 'AJUSTE'
        motivo,
        usuarioResponsable
    }) {
        if (!motivo || motivo.trim().length < 5) {
            throw new Error('[INVENTARIO ERROR] El motivo del movimiento es obligatorio (mínimo 5 caracteres).');
        }

        return await ejecutarTransaccion(async (tx) => {
            const producto = await InventarioRepository.buscarPorId(productoId, tx);
            if (!producto) {
                throw new Error(`[INVENTARIO ERROR] El producto con ID ${productoId} no existe.`);
            }

            const stockPrevio = producto.stock;
            const stockPosterior = stockPrevio + cantidadAjuste;

            if (stockPosterior < 0) {
                throw new Error(`[STOCK NEGATIVO PROHIBIDO] El ajuste dejaría el stock en ${stockPosterior}. Operación cancelada.`);
            }

            // Actualizar existencias
            if (cantidadAjuste > 0) {
                await InventarioRepository.reponerStock(productoId, cantidadAjuste, tx);
            } else if (cantidadAjuste < 0) {
                await InventarioRepository.descontarStock(productoId, Math.abs(cantidadAjuste), tx);
            }

            // Registrar trazabilidad inmutable en movimientos_inventario
            await MovimientoInventarioRepository.registrar({
                uuid: `mov-${Date.now()}`,
                inventarioId: productoId,
                tipo,
                cantidad: Math.abs(cantidadAjuste),
                stockPrevio,
                stockPosterior,
                motivo: motivo.trim(),
                usuarioResponsable
            }, tx);

            const semaforoActualizado = estadoStock({
                stock: stockPosterior,
                stock_minimo: producto.stock_minimo
            });

            return {
                productoId,
                nombre: producto.nombre,
                stockPrevio,
                stockPosterior,
                semaforo: semaforoActualizado
            };
        });
    }
};
