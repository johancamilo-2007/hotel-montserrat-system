/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE ESTANCIAS (PMS HOTELERO)
 * Registro de alojamientos, acumulación de folios y liquidación.
 * Mitigación AppSec: OWASP A03:2021 (Consultas parametrizadas)
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const EstanciaRepository = {
    async buscarPorId(id, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM estancias WHERE id = ?',
            [id],
            tx
        );
        return filas[0] || null;
    },

    async buscarActivaPorHabitacion(habitacionNumero, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM estancias WHERE habitacion_numero = ? AND estado = ?',
            [habitacionNumero, 'Activa'],
            tx
        );
        return filas[0] || null;
    },

    async buscarActivaPorHuesped(huespedId, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM estancias WHERE huesped_id = ? AND estado = ?',
            [huespedId, 'Activa'],
            tx
        );
        return filas[0] || null;
    },

    async crear({ uuid, huespedId, habitacionNumero, planId }, tx = null) {
        const res = await ejecutarQuery(
            `INSERT INTO estancias 
            (uuid, huesped_id, habitacion_numero, plan_id, comidas_hoy, total_folio, estado) 
            VALUES (?, ?, ?, ?, 0, 0, ?)`,
            [uuid, huespedId, habitacionNumero, planId, 'Activa'],
            tx
        );
        return {
            id: res.insertId,
            uuid,
            huespedId,
            habitacionNumero,
            planId,
            comidas_hoy: 0,
            total_folio: 0,
            estado: 'Activa'
        };
    },

    async acumularCargoFolio(estanciaId, monto, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE estancias SET total_folio = total_folio + ? WHERE id = ?',
            [monto, estanciaId],
            tx
        );
        return res.affectedRows > 0;
    },

    async finalizarEstancia(estanciaId, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE estancias SET estado = ? WHERE id = ?',
            ['Finalizada', estanciaId],
            tx
        );
        return res.affectedRows > 0;
    }
};
