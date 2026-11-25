/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE HABITACIONES
 * Gestión de inventario de habitaciones y estados de ocupación.
 * Mitigación AppSec: OWASP A03:2021 (Consultas parametrizadas)
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const HabitacionRepository = {
    async buscarPorNumero(numero, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM habitaciones WHERE numero = ?',
            [numero],
            tx
        );
        return filas[0] || null;
    },

    async listar(tx = null) {
        return await ejecutarQuery('SELECT * FROM habitaciones', [], tx);
    },

    async actualizarEstado(numero, nuevoEstado, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE habitaciones SET estado = ? WHERE numero = ?',
            [nuevoEstado, numero],
            tx
        );
        return res.affectedRows > 0;
    }
};
