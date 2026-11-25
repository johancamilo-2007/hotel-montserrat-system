/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - MIDDLEWARE DE AUTENTICACIÓN (SERVER-SIDE)
 * Validación de sesión por cookie HttpOnly; Secure o Bearer Token.
 * Mitigaciones AppSec: OWASP A07:2021 (Auth Failures), ASVS V3.4
 * ============================================================================
 */

import { obtenerSesionValida } from '../services/sessionService.js';
import { buscarUsuario } from '../services/userService.js';

export const NOMBRE_COOKIE_SESION = 'hotel_montserrat_session';

/**
 * Parsea cookies de la cabecera Cookie
 * @param {string} cookieHeader
 * @returns {Object}
 */
export function parsearCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
        list[name] = decodeURIComponent(value);
    });

    return list;
}

export function requerirAutenticacion(req, res, next) {
    // 1. Extraer ID de sesión de Cookie o Header Authorization
    const cookies = parsearCookies(req.headers.cookie);
    let sessionId = cookies[NOMBRE_COOKIE_SESION];

    if (!sessionId && req.headers.authorization) {
        const partes = req.headers.authorization.split(' ');
        if (partes[0] === 'Bearer' && partes[1]) {
            sessionId = partes[1].trim();
        }
    }

    if (!sessionId) {
        return res.status(401).json({
            ok: false,
            error: 'No autenticado: Se requiere una sesión válida para acceder a este recurso.'
        });
    }

    // 2. Validar sesión en servidor contra expiración dual
    const sesion = obtenerSesionValida(sessionId);
    if (!sesion) {
        // Limpiar cookie si expiró
        res.setHeader('Set-Cookie', `${NOMBRE_COOKIE_SESION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`);
        return res.status(401).json({
            ok: false,
            error: 'Sesión expirada o inválida. Por favor inicia sesión nuevamente.'
        });
    }

    // 3. Adjuntar usuario y sesión al objeto request
    const usuarioBD = buscarUsuario(sesion.username);
    if (!usuarioBD || !usuarioBD.activo) {
        return res.status(403).json({
            ok: false,
            error: 'La cuenta de usuario se encuentra inactiva o deshabilitada.'
        });
    }

    req.user = {
        id: usuarioBD.id,
        usuario: usuarioBD.usuario,
        rol: usuarioBD.rol,
        nombre: usuarioBD.nombre
    };
    req.session = sesion;

    next();
}
