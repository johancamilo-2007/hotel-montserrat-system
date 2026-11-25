/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE MOVIMIENTOS DE INVENTARIO
 * Trazabilidad inmutable de entradas, salidas y ajustes de existencias.
 * Mitigación AppSec: OWASP A09:2021 (Logging y Trazabilidad)
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const MovimientoInventarioRepository = {
    async registrar({
        uuid,
        inventarioId,
        tipo,
        cantidad,
        stockPrevio,
        stockPosterior,
        motivo,
        usuarioResponsable
    }, tx = null) {
        const res = await ejecutarQuery(
            `INSERT INTO movimientos_inventario 
            (uuid, inventario_id, tipo, cantidad, stock_previo, stock_posterior, motivo, usuario_responsable) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuid,
                inventarioId,
                tipo,
                cantidad,
                stockPrevio,
                stockPosterior,
                motivo,
                usuarioResponsable
            ],
            tx
        );
        return res.insertId;
    },

    async listarPorProducto(inventarioId, tx = null) {
        return await ejecutarQuery(
            'SELECT * FROM movimientos_inventario WHERE inventario_id = ?',
            [inventarioId],
            tx
        );
    }
};
