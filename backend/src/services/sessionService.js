/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - GESTOR DE SESIONES EN SERVIDOR (SERVER-SIDE)
 * Tokens criptográficos de 256 bits, expiración dual y rotación anti-fijación.
 * Mitigaciones AppSec: OWASP A07:2021 (Auth Failures), ASVS V3.3 / V3.4
 * ============================================================================
 */

import { generarTokenSeguro } from './cryptoService.js';
import { env } from '../config/env.js';

// Almacén en memoria de sesiones activas (Extensible a Redis / MySQL en Fase 2)
const sesionesActivas = new Map();

/**
 * Estructura de una sesión de servidor
 * @typedef {Object} SesionServidor
 * @property {string} id - Token de sesión aleatorio de 256 bits
 * @property {string} userId - ID del usuario autenticado
 * @property {string} username - Nombre de usuario
 * @property {string} rol - Rol asignado en el sistema
 * @property {string} nombre - Nombre para visualización
 * @property {number} createdAt - Marca temporal de creación (ms)
 * @property {number} lastActiveAt - Marca temporal de última interacción (ms)
 * @property {string} ip - Dirección IP de origen
 * @property {string} userAgent - Cabecera User-Agent
 */

/**
 * Crea una nueva sesión en el servidor con ID de 256 bits.
 * @param {Object} usuario
 * @param {string} ip
 * @param {string} userAgent
 * @returns {SesionServidor}
 */
export function crearSesion(usuario, ip = '127.0.0.1', userAgent = 'Unknown') {
    const ahora = Date.now();
    const sessionId = generarTokenSeguro();

    const sesion = {
        id: sessionId,
        userId: String(usuario.id || usuario.usuario),
        username: usuario.usuario,
        rol: usuario.rol,
        nombre: usuario.nombre || usuario.nombre_completo,
        createdAt: ahora,
        lastActiveAt: ahora,
        ip,
        userAgent
    };

    sesionesActivas.set(sessionId, sesion);
    return sesion;
}

/**
 * Obtiene y valida una sesión activa contra expiración por inactividad y duración absoluta.
 * @param {string} sessionId
 * @returns {SesionServidor|null} Sesión válida o null si expiró o no existe
 */
export function obtenerSesionValida(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return null;

    const sesion = sesionesActivas.get(sessionId);
    if (!sesion) return null;

    const ahora = Date.now();
    const inactividadMs = env.SESSION_INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    const duracionMaximaMs = env.SESSION_MAX_DURATION_HOURS * 60 * 60 * 1000;

    // 1. Validar expiración por inactividad (20 min)
    if (ahora - sesion.lastActiveAt > inactividadMs) {
        destruirSesion(sessionId);
        return null;
    }

    // 2. Validar duración absoluta máxima (12 horas)
    if (ahora - sesion.createdAt > duracionMaximaMs) {
        destruirSesion(sessionId);
        return null;
    }

    // Actualizar última actividad
    sesion.lastActiveAt = ahora;
    return sesion;
}

/**
 * Rota el identificador de sesión para mitigar ataques de fijación de sesión (Session Fixation - ASVS V3.4.1).
 * @param {string} oldSessionId
 * @returns {SesionServidor|null}
 */
export function rotarIdSesion(oldSessionId) {
    const sesionVieja = sesionesActivas.get(oldSessionId);
    if (!sesionVieja) return null;

    destruirSesion(oldSessionId);

    const newSessionId = generarTokenSeguro();
    const nuevaSesion = {
        ...sesionVieja,
        id: newSessionId,
        lastActiveAt: Date.now()
    };

    sesionesActivas.set(newSessionId, nuevaSesion);
    return nuevaSesion;
}

/**
 * Destruye y revoca permanentemente una sesión del servidor.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function destruirSesion(sessionId) {
    if (!sessionId) return false;
    return sesionesActivas.delete(sessionId);
}

/**
 * Revoca todas las sesiones activas de un usuario (ej. al cambiar contraseña o por sospecha de compromiso).
 * @param {string} username
 * @returns {number} Cantidad de sesiones revocadas
 */
export function revocarTodasLasSesionesUsuario(username) {
    let revocadas = 0;
    const u = String(username).toLowerCase();
    for (const [id, sesion] of sesionesActivas.entries()) {
        if (sesion.username.toLowerCase() === u) {
            sesionesActivas.delete(id);
            revocadas++;
        }
    }
    return revocadas;
}

export function limpiarSesionesExpiradas() {
    const ahora = Date.now();
    const inactividadMs = env.SESSION_INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    for (const [id, sesion] of sesionesActivas.entries()) {
        if (ahora - sesion.lastActiveAt > inactividadMs) {
            sesionesActivas.delete(id);
        }
    }
}
