/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE USUARIOS Y ROLES (SERVER-SIDE)
 * Control de acceso RBAC, bloqueo anti fuerza bruta y persistencia en memoria.
 * Mitigaciones AppSec: OWASP A01:2021 (Broken Access Control), A07:2021 (Auth)
 * ============================================================================
 */

import { derivarHashPassword, generarSal } from './cryptoService.js';
import { env } from '../config/env.js';

// Catálogo oficial de 7 roles (Homologado con SQL y Frontend)
export const ROLES = Object.freeze({
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    CAJERO: 'Cajero',
    MESERO: 'Mesero',
    RECEPCION: 'Recepción',
    BODEGA: 'Bodega',
    AUDITOR: 'Auditor'
});

// Matriz de permisos server-side (Deny by default)
export const PERMISOS = Object.freeze({
    eliminar_huesped: [ROLES.ADMINISTRADOR, ROLES.GERENTE],
    reiniciar_comidas: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.RECEPCION],
    importar_backup: [ROLES.ADMINISTRADOR],
    exportar_backup: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.AUDITOR],
    restablecer_sistema: [ROLES.ADMINISTRADOR],
    cierre_caja: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.CAJERO],
    surtir_inventario: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.BODEGA],
    crear_producto: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.BODEGA],
    crear_comanda: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.CAJERO, ROLES.MESERO],
    anular_comanda: [ROLES.ADMINISTRADOR, ROLES.GERENTE],
    ver_caja: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.CAJERO, ROLES.AUDITOR],
    ver_inventario: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.CAJERO, ROLES.MESERO, ROLES.RECEPCION, ROLES.BODEGA, ROLES.AUDITOR],
    ver_huespedes: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.RECEPCION, ROLES.AUDITOR],
    gestionar_usuarios: [ROLES.ADMINISTRADOR]
});

// Almacén en memoria de usuarios con sal individual y hashes seguros
const usuariosDB = new Map();
// Almacén de control de intentos fallidos y bloqueos por IP / usuario
const controlIntentos = new Map();

/**
 * Inicializa los usuarios de desarrollo con hashes PBKDF2 + Pepper de servidor.
 */
export async function inicializarUsuariosDemo() {
    usuariosDB.clear();

    const cuentasIniciales = [
        { usuario: 'admin', clave: 'Montserrat2026!Admin', rol: ROLES.ADMINISTRADOR, nombre: 'Administrador del Sistema' },
        { usuario: 'mesero', clave: 'Montserrat2026!Mesero', rol: ROLES.MESERO, nombre: 'Mesero de Turno' },
        { usuario: 'gerente', clave: 'Montserrat2026!Gerente', rol: ROLES.GERENTE, nombre: 'Gerente Operativo' },
        { usuario: 'cajero', clave: 'Montserrat2026!Cajero', rol: ROLES.CAJERO, nombre: 'Cajero Principal' },
        { usuario: 'recepcion', clave: 'Montserrat2026!Recepcion', rol: ROLES.RECEPCION, nombre: 'Recepción y Reservas' },
        { usuario: 'bodega', clave: 'Montserrat2026!Bodega', rol: ROLES.BODEGA, nombre: 'Encargado de Bodega' },
        { usuario: 'auditor', clave: 'Montserrat2026!Auditor', rol: ROLES.AUDITOR, nombre: 'Auditor Financiero' }
    ];

    for (const c of cuentasIniciales) {
        const salt = generarSal();
        const hash = await derivarHashPassword(c.clave, salt);
        usuariosDB.set(c.usuario.toLowerCase(), {
            id: `usr-${c.usuario}`,
            usuario: c.usuario,
            salt,
            hash,
            rol: c.rol,
            nombre: c.nombre,
            activo: true,
            debeCambiarPassword: false
        });
    }
}

export function buscarUsuario(username) {
    if (!username) return null;
    return usuariosDB.get(String(username).trim().toLowerCase()) || null;
}

export function usuarioTienePermiso(rol, accion) {
    if (!rol || !accion) return false;
    const autorizados = PERMISOS[accion];
    if (!autorizados || !Array.isArray(autorizados)) return false;
    return autorizados.includes(rol);
}

/**
 * Calcula el tiempo de penalización en ms según intentos fallidos acumulados en servidor.
 * Backoff progresivo:
 * - 3 fallos: 30 segundos
 * - 4 fallos: 60 segundos
 * - 5 fallos: 300 segundos (5 min)
 * - 6+ fallos: 900 segundos (15 min)
 * 
 * @param {number} intentos
 * @returns {number}
 */
export function calcularBackoffServidor(intentos) {
    if (intentos < env.MAX_LOGIN_ATTEMPTS) return 0;
    if (intentos === 3) return 30 * 1000;
    if (intentos === 4) return 60 * 1000;
    if (intentos === 5) return 5 * 60 * 1000;
    return 15 * 60 * 1000;
}

export function obtenerEstadoBloqueo(identificador) {
    const registro = controlIntentos.get(identificador);
    if (!registro) return { bloqueado: false, intentos: 0, restantes: env.MAX_LOGIN_ATTEMPTS };

    const ahora = Date.now();
    if (registro.bloqueadoHasta && ahora < registro.bloqueadoHasta) {
        const segundosRestantes = Math.ceil((registro.bloqueadoHasta - ahora) / 1000);
        return {
            bloqueado: true,
            segundosRestantes,
            intentos: registro.intentos,
            restantes: 0
        };
    }

    // Si el bloqueo expiró, se reinician los intentos (B1 en servidor)
    if (registro.bloqueadoHasta && ahora >= registro.bloqueadoHasta) {
        controlIntentos.delete(identificador);
        return { bloqueado: false, intentos: 0, restantes: env.MAX_LOGIN_ATTEMPTS };
    }

    const restantes = Math.max(0, env.MAX_LOGIN_ATTEMPTS - registro.intentos);
    return { bloqueado: false, intentos: registro.intentos, restantes };
}

export function registrarFalloLogin(identificador) {
    const ahora = Date.now();
    let registro = controlIntentos.get(identificador);

    if (!registro) {
        registro = { intentos: 1, bloqueadoHasta: null };
    } else {
        registro.intentos += 1;
    }

    const penalizacionMs = calcularBackoffServidor(registro.intentos);
    if (penalizacionMs > 0) {
        registro.bloqueadoHasta = ahora + penalizacionMs;
    }

    controlIntentos.set(identificador, registro);
    return {
        intentos: registro.intentos,
        bloqueado: penalizacionMs > 0,
        penalizacionMs
    };
}

export function limpiarFallosLogin(identificador) {
    controlIntentos.delete(identificador);
}
