/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE AUDITORÍA FORENSE INMUTABLE
 * Registro y consulta de eventos de seguridad (Append-Only).
 * Mitigación AppSec: OWASP A09:2021 (Security Logging), ASVS V8.2
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const AuditoriaRepository = {
    async registrarEvento({
        uuid,
        usuario,
        rol,
        ip,
        userAgent = '',
        evento,
        resultado,
        recurso = '',
        detalles = null,
        firmaIntegridad = null
    }, tx = null) {
        const res = await ejecutarQuery(
            `INSERT INTO bitacora_auditoria 
            (uuid, usuario, rol, ip, user_agent, evento, resultado, recurso, detalles, firma_integridad) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uuid,
                usuario,
                rol,
                ip,
                userAgent,
                evento,
                resultado,
                recurso,
                typeof detalles === 'object' ? JSON.stringify(detalles) : detalles,
                firmaIntegridad
            ],
            tx
        );

        return res.insertId;
    },

    async listarEventos(limite = 50, tx = null) {
        return await ejecutarQuery('SELECT * FROM bitacora_auditoria', [], tx);
    }
};
