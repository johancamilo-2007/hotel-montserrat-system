/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - MIDDLEWARE DE CORS RESTRICTIVO
 * Mitigación AppSec: OWASP A01:2021 (Broken Access Control), ASVS V14.4.6
 * ============================================================================
 */

import { env } from '../config/env.js';

export function aplicarCORS(req, res, next) {
    const origin = req.headers.origin;

    if (origin) {
        if (env.CORS_ORIGIN.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
            res.setHeader('Access-Control-Max-Age', '86400'); // 24 horas preflight cache
        } else {
            // Origen no autorizado: bloquear CORS
            if (req.method === 'OPTIONS') {
                return res.status(403).json({ ok: false, error: 'Origen no permitido por la política CORS.' });
            }
        }
    }

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    next();
}
