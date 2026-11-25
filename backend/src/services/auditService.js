/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SERVICIO DE AUDITORÍA Y TRAZABILIDAD FORENSE
 * Registro inmutable de eventos sensibles de seguridad.
 * Mitigación AppSec: OWASP A09:2021 (Security Logging & Monitoring), ASVS V7
 * ============================================================================
 */

export const EVENTOS_AUDITORIA = Object.freeze({
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    BRUTE_FORCE_LOCKOUT: 'BRUTE_FORCE_LOCKOUT',
    REAUTH_SUCCESS: 'REAUTH_SUCCESS',
    REAUTH_FAILED: 'REAUTH_FAILED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    DESTRUCTIVE_ACTION: 'DESTRUCTIVE_ACTION'
});

const bitacoraEventos = [];
const MAX_LOGS_MEMORIA = 5000;

/**
 * Registra un evento de seguridad de forma estructurada.
 * @param {string} tipo - Uno de EVENTOS_AUDITORIA
 * @param {Object} payload
 */
export function registrarEventoSeguridad(tipo, {
    username = 'anónimo',
    rol = 'none',
    ip = '127.0.0.1',
    userAgent = 'unknown',
    recurso = '',
    resultado = 'SUCCESS',
    detalles = null
} = {}) {
    const entrada = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        tipo,
        username,
        rol,
        ip,
        userAgent: String(userAgent).slice(0, 150),
        recurso,
        resultado,
        detalles
    };

    bitacoraEventos.push(entrada);
    if (bitacoraEventos.length > MAX_LOGS_MEMORIA) {
        bitacoraEventos.shift();
    }

    // Salida estructurada a consola de servidor para ingestión por SIEM
    if (process.env.NODE_ENV !== 'test') {
        const nivel = (resultado === 'FAILED' || tipo === EVENTOS_AUDITORIA.BRUTE_FORCE_LOCKOUT || tipo === EVENTOS_AUDITORIA.PERMISSION_DENIED)
            ? 'WARN'
            : 'INFO';
        console.log(`[AUDIT][${nivel}][${entrada.timestamp}] ${tipo} | User: ${username} | Role: ${rol} | IP: ${ip} | Res: ${resultado}`);
    }

    return entrada;
}

export function obtenerEventosAuditoria(limite = 100) {
    return bitacoraEventos.slice(-limite).reverse();
}
