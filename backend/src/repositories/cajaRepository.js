/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE CIERRES DE CAJA Y ARQUEO
 * Persistencia de actas oficiales de arqueo y separación de caja vs. folios.
 * Mitigación AppSec: OWASP A03:2021 (SQLi)
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const CajaRepository = {
    async registrarCierre({
        uuid,
        fecha,
        hora,
        usuarioResponsable,
        comandasTotales,
        totalCaja,
        totalFolios,
        efectivoContado,
        diferencia,
        motivoReapertura = null
    }, tx = null) {
        const res = await ejecutarQuery(
            `INSERT INTO cierres_caja 
            (uuid, fecha, hora, usuario_responsable, comandas_totales, total_caja, total_folios, efectivo_contado, diferencia, motivo_reapertura) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuid,
                fecha,
                hora,
                usuarioResponsable,
                comandasTotales,
                totalCaja,
                totalFolios,
                efectivoContado,
                diferencia,
                motivoReapertura
            ],
            tx
        );

        return {
            id: res.insertId,
            uuid,
            fecha,
            usuarioResponsable,
            totalCaja,
            totalFolios,
            efectivoContado,
            diferencia
        };
    },

    async listarCierres(tx = null) {
        return await ejecutarQuery('SELECT * FROM cierres_caja', [], tx);
    },

    async buscarPorFecha(fecha, tx = null) {
        return await ejecutarQuery('SELECT * FROM cierres_caja WHERE fecha = ?', [fecha], tx);
    }
};
