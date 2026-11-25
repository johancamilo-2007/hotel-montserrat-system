/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE HUÉSPEDES Y ESTANCIAS
 * Capa de persistencia con consultas parametrizadas.
 * Mitigación AppSec: OWASP A03:2021 (SQL Injection)
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const HuespedRepository = {
    async buscarPorId(id, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM huespedes WHERE id = ?',
            [id],
            tx
        );
        return filas[0] || null;
    },

    async buscarPorDocumento(documento, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM huespedes WHERE documento = ?',
            [documento],
            tx
        );
        return filas[0] || null;
    },

    async listarActivos(tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM huespedes WHERE estado = ?',
            ['Activo'],
            tx
        );
        return filas;
    },

    async crear({ uuid, nombre, documento, habitacion, plan_id }, tx = null) {
        const res = await ejecutarQuery(
            'INSERT INTO huespedes (uuid, nombre, documento, habitacion, plan_id, comidas_hoy, estado) VALUES (?, ?, ?, ?, ?, 0, ?)',
            [uuid, nombre, documento, habitacion, plan_id, 'Activo'],
            tx
        );
        return { id: res.insertId, uuid, nombre, documento, habitacion, plan_id, comidas_hoy: 0, estado: 'Activo' };
    },

    async incrementarComidasHoy(id, cantidad = 1, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE huespedes SET comidas_hoy = comidas_hoy + ? WHERE id = ?',
            [cantidad, id],
            tx
        );
        return res.affectedRows > 0;
    },

    async reiniciarComidasDiarias(tx = null) {
        const res = await ejecutarQuery(
            'UPDATE huespedes SET comidas_hoy = 0 WHERE estado = ?',
            ['Activo'],
            tx
        );
        return res.affectedRows;
    },

    async checkOut(id, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE huespedes SET estado = ? WHERE id = ?',
            ['Check-out', id],
            tx
        );
        return res.affectedRows > 0;
    },

    async eliminar(id, tx = null) {
        const res = await ejecutarQuery(
            'DELETE FROM huespedes WHERE id = ?',
            [id],
            tx
        );
        return res.affectedRows > 0;
    }
};
