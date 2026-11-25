/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SEGURIDAD Y CONTROL DE ACCESOS (MÓDULO ES)
 * 
 * Implementación de autenticación de prototipo, hashing con PBKDF2-SHA256
 * (WebCrypto), control de acceso basado en roles (RBAC), backoff de bloqueo
 * y mitigaciones de seguridad en cliente.
 * 
 * NOTA APPSEC / LIMITACIÓN CONOCIDA: En una arquitectura 100% frontend, el
 * código JavaScript y el sessionStorage residen en el navegador del usuario.
 * Todo control en el cliente es COSMÉTICO hasta contar con backend en Fase 1.
 * Referencia: OWASP A01:2021 (Broken Access Control), A07:2021 (Auth Failures).
 * ============================================================================
 */

import { validarBackup } from './domain/backup.js';
import { migrar } from './domain/migraciones.js';

// Catálogo oficial de roles del sistema (Bloque B-4 / SQL normalizado)
export const ROLES = Object.freeze({
    ADMINISTRADOR: 'Administrador',
    GERENTE: 'Gerente',
    CAJERO: 'Cajero',
    MESERO: 'Mesero',
    RECEPCION: 'Recepción',
    BODEGA: 'Bodega',
    AUDITOR: 'Auditor'
});

// Matriz de permisos (Acción -> Roles autorizados) (Bloque B-4)
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
    ver_huespedes: [ROLES.ADMINISTRADOR, ROLES.GERENTE, ROLES.RECEPCION, ROLES.AUDITOR]
});

// Semilla de usuarios protegida con PBKDF2-SHA256 (310.000 iteraciones, sal única por usuario)
// B-1: Sin contraseñas en texto plano, sin aliases ni claves antiguas.
export const USUARIOS_HASHED = Object.freeze([
    {
        usuario: 'admin',
        salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
        hash: 'd9a2f88a479d74e78e43d777fae7a69034e5b35ce8821093b51e8a68ccabf863',
        rol: ROLES.ADMINISTRADOR,
        nombre: 'Administrador del Sistema'
    },
    {
        usuario: 'mesero',
        salt: 'f0e1d2c3b4a5968778695a4b3c2d1e0f',
        hash: '3374c240469795962ea08d7b82cdff0281e99be4bbd38ff216a8fe847b53abed',
        rol: ROLES.MESERO,
        nombre: 'Mesero de Turno'
    },
    {
        usuario: 'gerente',
        salt: '11223344556677889900aabbccddeeff',
        hash: 'b04fc1510120e879669160db2e8b17794b6ed3f2f095d240146596076aee2b9b',
        rol: ROLES.GERENTE,
        nombre: 'Gerencia General'
    },
    {
        usuario: 'cajero',
        salt: 'aabbccddeeff00112233445566778899',
        hash: '4768a99757df01c65c9aa67669d2233d263e7008f27a5f0daf3dee3895d27cee',
        rol: ROLES.CAJERO,
        nombre: 'Cajero Principal'
    },
    {
        usuario: 'recepcion',
        salt: '1234567890abcdef1234567890abcdef',
        hash: '3d5d59edd2429d9f5627ddf1dcb1dcd0956f8a1bb168e832a1e204d23fcda14e',
        rol: ROLES.RECEPCION,
        nombre: 'Recepción y Reservas'
    },
    {
        usuario: 'bodega',
        salt: 'fedcba0987654321fedcba0987654321',
        hash: 'eba8e05e11a618ce9f9e61f74649a5a43997c41404020ecde0ba98563d94bc93',
        rol: ROLES.BODEGA,
        nombre: 'Encargado de Inventario'
    },
    {
        usuario: 'auditor',
        salt: 'abcdef1234567890abcdef1234567890',
        hash: '35295b1ab79fce0af3cf3863ae1c8adf1ad9af032f7a1590a1fc35f86f644282',
        rol: ROLES.AUDITOR,
        nombre: 'Auditor Externo'
    }
]);

// Constantes de configuración de seguridad
export const MAX_INTENTOS_INICIAL = 3;
export const TIEMPO_INACTIVIDAD_MS = 20 * 60 * 1000; // 20 minutos
let timerInactividad = null;

/**
 * Calcula el tiempo de penalización en ms según el número acumulado de intentos fallidos (Bloque B-7).
 * Backoff creciente:
 * - 3 fallos: 30 segundos
 * - 4 fallos: 1 minuto (60 s)
 * - 5 fallos: 5 minutos (300 s)
 * - 6+ fallos: 15 minutos (900 s)
 * 
 * @param {number} intentos
 * @returns {number} Tiempo en milisegundos
 */
export function calcularTiempoBloqueoMs(intentos) {
    if (intentos < 3) return 0;
    if (intentos === 3) return 30 * 1000;
    if (intentos === 4) return 60 * 1000;
    if (intentos === 5) return 5 * 60 * 1000;
    return 15 * 60 * 1000;
}

/**
 * Deriva un hash PBKDF2-SHA256 con WebCrypto (Bloque B-3).
 * @param {string} password
 * @param {string} saltHex
 * @param {number} [iteraciones=310000]
 * @returns {Promise<string>}
 */
export async function derivarHashPBKDF2(password, saltHex, iteraciones = 310000) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('WebCrypto API no está disponible en este entorno.');
    }
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: iteraciones,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );
    return Array.from(new Uint8Array(derivedBits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Comparación segura de cadenas en tiempo constante para mitigar timing attacks (ASVS V2.10.4).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function compararTiempoConstante(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) {
        res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return res === 0;
}

/**
 * Migra datos legacy de hotelAndino_* de forma aislada e idempotente (Bloque B-2).
 */
export function migrarDatosLegacy() {
    if (typeof localStorage !== 'undefined') {
        const legacyDB = localStorage.getItem('hotelAndino_DB_v2') || localStorage.getItem('hotelAndino_DB');
        if (legacyDB && !localStorage.getItem('hotelMontserrat_DB_v2')) {
            try {
                const parsed = JSON.parse(legacyDB);
                const dbMigrada = migrar(parsed);
                const resultado = validarBackup(dbMigrada);
                if (resultado.ok && resultado.datosLimpios) {
                    localStorage.setItem('hotelMontserrat_DB_v2', JSON.stringify(resultado.datosLimpios));
                }
            } catch (e) {
                console.warn('Advertencia al migrar base legacy:', e);
            }
        }
        localStorage.removeItem('hotelAndino_DB_v2');
        localStorage.removeItem('hotelAndino_DB');
    }

    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('hotelAndino_logged');
        sessionStorage.removeItem('hotelAndino_user');
        sessionStorage.removeItem('hotelAndino_intentos');
        sessionStorage.removeItem('hotelAndino_bloqueadoHasta');
    }
}

/**
 * Obtiene el estado de bloqueo almacenado en sessionStorage.
 * B1: Si el bloqueo expiró (Date.now() >= tiempo), los intentos vuelven a 0
 * y el siguiente fallo NO bloquea de inmediato.
 * @returns {Date|null}
 */
export function obtenerBloqueo() {
    if (typeof sessionStorage === 'undefined') return null;
    const bloqueoStr = sessionStorage.getItem('hotelMontserrat_bloqueadoHasta');
    if (!bloqueoStr) return null;
    const tiempo = parseInt(bloqueoStr, 10);
    if (isNaN(tiempo)) return null;

    const fechaBloqueo = new Date(tiempo);
    if (Date.now() >= fechaBloqueo.getTime()) {
        limpiarIntentos();
        return null;
    }
    return fechaBloqueo;
}

export function guardarBloqueo(fechaFin) {
    if (typeof sessionStorage === 'undefined') return;
    if (fechaFin) {
        sessionStorage.setItem('hotelMontserrat_bloqueadoHasta', fechaFin.getTime().toString());
    } else {
        sessionStorage.removeItem('hotelMontserrat_bloqueadoHasta');
    }
}

export function obtenerIntentos() {
    if (typeof sessionStorage === 'undefined') return 0;
    return parseInt(sessionStorage.getItem('hotelMontserrat_intentos') || '0', 10);
}

export function incrementarIntentos() {
    if (typeof sessionStorage === 'undefined') return 1;
    obtenerBloqueo(); // Revisa si expiró previamente
    const actuales = obtenerIntentos() + 1;
    sessionStorage.setItem('hotelMontserrat_intentos', actuales.toString());
    return actuales;
}

export function limpiarIntentos() {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem('hotelMontserrat_intentos');
    sessionStorage.removeItem('hotelMontserrat_bloqueadoHasta');
}

export function estaAutenticado() {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem('hotelMontserrat_logged') === 'true';
}

/**
 * B2: Obtiene el usuario autenticado. Si no hay sesión válida, retorna estrictamente NULL
 * (elimina la vulnerabilidad de elevación de privilegios que devolvía 'admin' por defecto).
 * @returns {Object|null}
 */
export function obtenerUsuarioActual() {
    if (!estaAutenticado()) return null;
    const data = sessionStorage.getItem('hotelMontserrat_user');
    try {
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Valida si el usuario en sesión tiene autorización para ejecutar una acción (Bloque B-4).
 * Política: Deny by default.
 * @param {string} accion
 * @returns {boolean}
 */
export function puede(accion) {
    const usuario = obtenerUsuarioActual();
    if (!usuario || !usuario.rol) return false;
    const rolesAutorizados = PERMISOS[accion];
    if (!rolesAutorizados || !Array.isArray(rolesAutorizados)) return false;
    return rolesAutorizados.includes(usuario.rol);
}

/**
 * Exige permiso para una acción lanzando un error explicativo si no lo tiene.
 * @param {string} accion
 * @returns {boolean}
 */
export function requierePermiso(accion) {
    if (!puede(accion)) {
        throw new Error(`Acceso denegado: Tu rol actual no cuenta con permiso para "${accion}".`);
    }
    return true;
}

/**
 * Inicia sesión validando credenciales contra hashes PBKDF2 (Bloque B-3 / B-7).
 * Integra soporte híbrido para servidor backend en Fase 1 con fallback local.
 * @param {string} usuario
 * @param {string} password
 * @returns {Promise<{ ok: boolean, mensaje: string, usuario?: Object }>}
 */
export async function validarLogin(usuario, password) {
    const uLimpio = String(usuario || '').trim().toLowerCase();
    const pLimpio = String(password || '');

    // Intentar autenticación con el servidor backend si estamos sirviendo vía HTTP(S)
    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        try {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ usuario: uLimpio, password: pLimpio })
            });
            const data = await resp.json().catch(() => null);
            if (resp.ok && data?.ok) {
                limpiarIntentos();
                const infoSesion = {
                    usuario: data.usuario.usuario,
                    rol: data.usuario.rol,
                    nombre: data.usuario.nombre,
                    token: data.token,
                    horaLogin: new Date().toISOString()
                };
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('hotelMontserrat_logged', 'true');
                    sessionStorage.setItem('hotelMontserrat_user', JSON.stringify(infoSesion));
                }
                return { ok: true, mensaje: 'Autenticación exitosa en servidor', usuario: infoSesion };
            } else if (data?.error) {
                return { ok: false, mensaje: data.error };
            }
        } catch (e) {
            // Backend inalcanzable, fallback automático al motor local de cliente
        }
    }

    // 1. Verificar bloqueo activo por backoff
    const bloqueo = obtenerBloqueo();
    if (bloqueo && Date.now() < bloqueo.getTime()) {
        const segs = Math.ceil((bloqueo.getTime() - Date.now()) / 1000);
        return {
            ok: false,
            mensaje: `🔒 Acceso bloqueado por seguridad. Intenta nuevamente en ${segs} segundos.`
        };
    }

    // 2. Buscar usuario en el catálogo
    const cuenta = USUARIOS_HASHED.find(u => u.usuario.toLowerCase() === uLimpio);
    if (!cuenta) {
        const intentos = incrementarIntentos();
        const penalizacionMs = calcularTiempoBloqueoMs(intentos);
        if (penalizacionMs > 0) {
            guardarBloqueo(new Date(Date.now() + penalizacionMs));
            return {
                ok: false,
                mensaje: `🔒 Número de intentos excedido. Sistema bloqueado por ${Math.ceil(penalizacionMs / 1000)}s.`
            };
        }
        const restantes = Math.max(0, MAX_INTENTOS_INICIAL - intentos);
        return {
            ok: false,
            mensaje: `❌ Credenciales incorrectas. Te quedan ${restantes} intento(s) antes del bloqueo.`
        };
    }

    // 3. Derivar hash de la contraseña provista y comparar en tiempo constante
    const hashCalculado = await derivarHashPBKDF2(pLimpio, cuenta.salt);
    const coincide = compararTiempoConstante(hashCalculado, cuenta.hash);

    if (coincide) {
        // Éxito: limpiar contador de intentos y guardar sesión
        limpiarIntentos();
        const infoSesion = {
            usuario: cuenta.usuario,
            rol: cuenta.rol,
            nombre: cuenta.nombre,
            horaLogin: new Date().toISOString()
        };

        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('hotelMontserrat_logged', 'true');
            sessionStorage.setItem('hotelMontserrat_user', JSON.stringify(infoSesion));
        }

        return { ok: true, mensaje: 'Autenticación exitosa', usuario: infoSesion };
    } else {
        const intentos = incrementarIntentos();
        const penalizacionMs = calcularTiempoBloqueoMs(intentos);
        if (penalizacionMs > 0) {
            guardarBloqueo(new Date(Date.now() + penalizacionMs));
            return {
                ok: false,
                mensaje: `🔒 Número de intentos excedido. Sistema bloqueado por ${Math.ceil(penalizacionMs / 1000)}s.`
            };
        }
        const restantes = Math.max(0, MAX_INTENTOS_INICIAL - intentos);
        return {
            ok: false,
            mensaje: `❌ Credenciales incorrectas. Te quedan ${restantes} intento(s) antes del bloqueo.`
        };
    }
}

/**
 * Reautentica al usuario activo para operaciones destructivas (Bloque B-6).
 * Valida contra el servidor backend si está disponible, o contra el almacén local.
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function reautenticar(password) {
    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        try {
            const user = obtenerUsuarioActual();
            const resp = await fetch('/api/auth/reauth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({ password: String(password || '') })
            });
            const data = await resp.json().catch(() => null);
            if (resp.ok && data?.ok) return true;
        } catch (e) {
            // Fallback local
        }
    }

    const usuarioActual = obtenerUsuarioActual();
    if (!usuarioActual) return false;
    const cuenta = USUARIOS_HASHED.find(u => u.usuario.toLowerCase() === usuarioActual.usuario.toLowerCase());
    if (!cuenta) return false;
    const hash = await derivarHashPBKDF2(String(password || ''), cuenta.salt);
    return compararTiempoConstante(hash, cuenta.hash);
}

/**
 * Cierra la sesión activa y limpia almacenamiento de sesión (cliente y servidor).
 */
export function cerrarSesion() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
        try {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        } catch (e) {}
    }
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('hotelMontserrat_logged');
        sessionStorage.removeItem('hotelMontserrat_user');
    }
    clearTimeout(timerInactividad);
}

/**
 * Configura el temporizador de cierre de sesión por inactividad.
 * @param {Function} onTimeout - Callback a ejecutar al expirar la sesión
 */
export function iniciarTimerInactividad(onTimeout) {
    if (typeof document === 'undefined') return;

    const reiniciar = () => {
        clearTimeout(timerInactividad);
        if (!estaAutenticado()) return;
        timerInactividad = setTimeout(() => {
            if (estaAutenticado()) {
                cerrarSesion();
                if (typeof onTimeout === 'function') onTimeout();
            }
        }, TIEMPO_INACTIVIDAD_MS);
    };

    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(evento => {
        document.addEventListener(evento, reiniciar, { passive: true });
    });

    reiniciar();
}
