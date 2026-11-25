/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SUITE DE PRUEBAS DE SEGURIDAD (FASE 1)
 * Verificación de Hashing Argon2/PBKDF2, Sesiones Seguras, RBAC Server-Side,
 * Anti Fuerza Bruta con Backoff y Cabeceras de Hardening HTTP.
 * 
 * Ejecución: node --test backend/tests/security.test.js
 * ============================================================================
 */

import { test, describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    derivarHashPassword,
    verificarPassword,
    validarPoliticaPassword,
    generarSal,
    generarTokenSeguro
} from '../src/services/cryptoService.js';

import {
    crearSesion,
    obtenerSesionValida,
    rotarIdSesion,
    destruirSesion,
    revocarTodasLasSesionesUsuario
} from '../src/services/sessionService.js';

import {
    ROLES,
    PERMISOS,
    usuarioTienePermiso,
    obtenerEstadoBloqueo,
    registrarFalloLogin,
    limpiarFallosLogin,
    inicializarUsuariosDemo,
    buscarUsuario
} from '../src/services/userService.js';

import { crearApp } from '../src/app.js';
import { NOMBRE_COOKIE_SESION } from '../src/middlewares/authMiddleware.js';

// ============================================================================
// 1. PRUEBAS CRIPTOGRÁFICAS Y POLÍTICA DE CONTRASEÑAS (ASVS V2.1 / V2.4)
// ============================================================================

describe('Fase 1: Capa Criptográfica y Política de Contraseñas', () => {

    it('Hashing seguro: derivarHashPassword genera hashes únicos con sal y pepper de servidor', async () => {
        const sal1 = generarSal();
        const sal2 = generarSal();
        const hash1 = await derivarHashPassword('ClaveSegura123!@#', sal1);
        const hash2 = await derivarHashPassword('ClaveSegura123!@#', sal2);

        assert.notStrictEqual(hash1, hash2, 'Diferente sal debe generar diferente hash');
        assert.strictEqual(typeof hash1, 'string');
        assert.strictEqual(hash1.length, 64, 'El hash SHA-256 debe tener 64 caracteres hex');
    });

    it('Timing-safe verification: verificarPassword valida contraseñas correctas y rechaza incorrectas', async () => {
        const sal = generarSal();
        const hash = await derivarHashPassword('MiPassword123!@#', sal);

        const valida = await verificarPassword('MiPassword123!@#', sal, hash);
        const invalida = await verificarPassword('PasswordErroneo!', sal, hash);

        assert.strictEqual(valida, true);
        assert.strictEqual(invalida, false);
    });

    it('Política de contraseñas: exige mínimo 12 caracteres, mayúsculas, minúsculas, números y símbolos', () => {
        assert.strictEqual(validarPoliticaPassword('Corta1!').valida, false, 'Rechaza < 12 caracteres');
        assert.strictEqual(validarPoliticaPassword('sololetrasminusculas123').valida, false, 'Rechaza sin mayúsculas/símbolos');
        assert.strictEqual(validarPoliticaPassword('Password123!').valida, false, 'Rechaza contraseñas en lista negra');
        assert.strictEqual(validarPoliticaPassword('Montserrat2026!Robusta').valida, true, 'Acepta contraseña conforme a política');
    });

});

// ============================================================================
// 2. PRUEBAS DE GESTIÓN DE SESIONES EN SERVIDOR (ASVS V3.3 / V3.4)
// ============================================================================

describe('Fase 1: Ciclo de Vida de Sesiones en Servidor (Server-Side)', () => {

    it('Creación y tokens: crearSesion genera identificador criptográfico de 256 bits (64 hex)', () => {
        const usuarioMock = { id: 'u1', usuario: 'admin', rol: ROLES.ADMINISTRADOR, nombre: 'Admin' };
        const sesion = crearSesion(usuarioMock, '192.168.1.10', 'Mozilla/5.0');

        assert.strictEqual(typeof sesion.id, 'string');
        assert.strictEqual(sesion.id.length, 64, 'Token de sesión debe tener 256 bits (64 hex)');
        assert.strictEqual(sesion.username, 'admin');

        const recuperada = obtenerSesionValida(sesion.id);
        assert.strictEqual(recuperada !== null, true);
        assert.strictEqual(recuperada.id, sesion.id);
    });

    it('Rotación de sesión anti-fijación: rotarIdSesion cambia el ID y revoca el anterior', () => {
        const usuarioMock = { id: 'u2', usuario: 'mesero', rol: ROLES.MESERO, nombre: 'Mesero' };
        const sesionOriginal = crearSesion(usuarioMock);
        const originalId = sesionOriginal.id;

        const nuevaSesion = rotarIdSesion(originalId);
        assert.notStrictEqual(nuevaSesion.id, originalId);
        assert.strictEqual(obtenerSesionValida(originalId), null, 'El ID de sesión antiguo debe quedar revocado');
        assert.strictEqual(obtenerSesionValida(nuevaSesion.id) !== null, true);
    });

    it('Revocación masiva: revocarTodasLasSesionesUsuario elimina todas las sesiones de un usuario', () => {
        const u = { id: 'u3', usuario: 'cajero', rol: ROLES.CAJERO, nombre: 'Cajero' };
        const s1 = crearSesion(u);
        const s2 = crearSesion(u);

        const revocadas = revocarTodasLasSesionesUsuario('cajero');
        assert.strictEqual(revocadas >= 2, true);
        assert.strictEqual(obtenerSesionValida(s1.id), null);
        assert.strictEqual(obtenerSesionValida(s2.id), null);
    });

});

// ============================================================================
// 3. PRUEBAS DE AUTORIZACIÓN RBAC SERVER-SIDE (DENY-BY-DEFAULT - ASVS V4.1)
// ============================================================================

describe('Fase 1: Autorización RBAC Server-Side (Deny-by-Default)', () => {

    it('RBAC estricto: matriz PERMISOS restringe acciones según el rol asignado', () => {
        assert.strictEqual(usuarioTienePermiso(ROLES.MESERO, 'crear_comanda'), true);
        assert.strictEqual(usuarioTienePermiso(ROLES.MESERO, 'eliminar_huesped'), false);
        assert.strictEqual(usuarioTienePermiso(ROLES.MESERO, 'cierre_caja'), false);
        assert.strictEqual(usuarioTienePermiso(ROLES.MESERO, 'restablecer_sistema'), false);

        assert.strictEqual(usuarioTienePermiso(ROLES.CAJERO, 'cierre_caja'), true);
        assert.strictEqual(usuarioTienePermiso(ROLES.CAJERO, 'eliminar_huesped'), false);

        assert.strictEqual(usuarioTienePermiso(ROLES.ADMINISTRADOR, 'eliminar_huesped'), true);
        assert.strictEqual(usuarioTienePermiso(ROLES.ADMINISTRADOR, 'restablecer_sistema'), true);
        assert.strictEqual(usuarioTienePermiso(ROLES.ADMINISTRADOR, 'gestionar_usuarios'), true);
    });

});

// ============================================================================
// 4. PRUEBAS DE INTEGRACIÓN HTTP: LOGIN, RATE LIMITING, COOKIES Y HARDENING
// ============================================================================

describe('Fase 1: Integración HTTP y Protección de Aplicación Web', () => {

    let app;

    before(async () => {
        await inicializarUsuariosDemo();
        app = crearApp();
    });

    // Helper para simular peticiones HTTP en app.handle
    function simularPeticion(metodo, ruta, { headers = {}, body = null } = {}) {
        return new Promise((resolve) => {
            const reqListeners = {};
            const resHeaders = {};
            let responseBody = '';
            let statusCode = 200;

            const req = {
                method: metodo,
                url: ruta,
                destroyed: false,
                headers: {
                    host: 'localhost:4000',
                    'content-type': 'application/json',
                    ...headers
                },
                on(evento, cb) {
                    reqListeners[evento] = cb;
                },
                destroy() {
                    this.destroyed = true;
                }
            };

            const res = {
                statusCode: 200,
                writableEnded: false,
                setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
                getHeader(k) { return resHeaders[k.toLowerCase()]; },
                removeHeader(k) { delete resHeaders[k.toLowerCase()]; },
                end(data) {
                    if (this.writableEnded) return;
                    this.writableEnded = true;
                    if (data) responseBody += data;
                    resolve({
                        status: this.statusCode,
                        headers: resHeaders,
                        body: responseBody ? JSON.parse(responseBody) : null
                    });
                }
            };

            // Iniciar procesamiento en la app
            app.handle(req, res);

            // Simular emisión asíncrona de body para dar tiempo a los middlewares de registrar los listeners
            setTimeout(() => {
                if (req.destroyed) return;
                if (body !== null) {
                    const jsonStr = JSON.stringify(body);
                    if (reqListeners['data']) reqListeners['data'](Buffer.from(jsonStr));
                    if (!req.destroyed && reqListeners['end']) reqListeners['end']();
                } else {
                    if (!req.destroyed && reqListeners['end']) reqListeners['end']();
                }
            }, 10);
        });
    }

    it('Hardening HTTP: cabeceras Helmet, CSP estricta, HSTS y no-sniff están presentes', async () => {
        const respuesta = await simularPeticion('GET', '/api/auth/me');

        assert.strictEqual(respuesta.headers['content-security-policy']?.includes("default-src 'self'"), true);
        assert.strictEqual(respuesta.headers['strict-transport-security']?.includes('max-age=31536000'), true);
        assert.strictEqual(respuesta.headers['x-frame-options'], 'DENY');
        assert.strictEqual(respuesta.headers['x-content-type-options'], 'nosniff');
    });

    it('Login seguro: autenticación exitosa emite cookie HttpOnly; SameSite=Strict', async () => {
        const respuesta = await simularPeticion('POST', '/api/auth/login', {
            body: { usuario: 'admin', password: 'Montserrat2026!Admin' }
        });

        assert.strictEqual(respuesta.status, 200);
        assert.strictEqual(respuesta.body.ok, true);
        assert.strictEqual(respuesta.body.usuario.rol, ROLES.ADMINISTRADOR);

        const cookieSet = respuesta.headers['set-cookie'];
        assert.strictEqual(cookieSet?.includes('HttpOnly'), true);
        assert.strictEqual(cookieSet?.includes('SameSite=Strict'), true);
        assert.strictEqual(cookieSet?.includes(NOMBRE_COOKIE_SESION), true);
    });

    it('Anti fuerza bruta: login con credenciales erróneas impone bloqueo con backoff en servidor', async () => {
        const ipTest = '198.51.100.25';
        const headers = { 'x-forwarded-for': ipTest };

        // 3 intentos fallidos consecutivos
        await simularPeticion('POST', '/api/auth/login', { headers, body: { usuario: 'mesero', password: 'mal' } });
        await simularPeticion('POST', '/api/auth/login', { headers, body: { usuario: 'mesero', password: 'mal' } });
        const res3 = await simularPeticion('POST', '/api/auth/login', { headers, body: { usuario: 'mesero', password: 'mal' } });

        assert.strictEqual(res3.status, 429, 'El 3er intento fallido debe bloquear con HTTP 429');
        assert.strictEqual(res3.body.error.includes('bloqueado'), true);

        // El 4to intento inmediato debe ser rechazado sin procesar
        const res4 = await simularPeticion('POST', '/api/auth/login', { headers, body: { usuario: 'mesero', password: 'Montserrat2026!Mesero' } });
        assert.strictEqual(res4.status, 429);
    });

    it('RBAC Server-Side: Mesero autenticado NO puede eliminar huéspedes ni restablecer sistema (HTTP 403)', async () => {
        // Iniciar sesión como mesero
        const loginRes = await simularPeticion('POST', '/api/auth/login', {
            body: { usuario: 'mesero', password: 'Montserrat2026!Mesero' }
        });
        const tokenMesero = loginRes.body.token;
        const headersAuth = { authorization: `Bearer ${tokenMesero}` };

        // 1. Intentar acción permitida: crear comanda
        const resComanda = await simularPeticion('POST', '/api/comandas', {
            headers: headersAuth,
            body: { plato: 'Lomo Fino', cantidad: 2, cliente: 'Juan', metodoPago: 'EFECTIVO' }
        });
        assert.strictEqual(resComanda.status, 201);
        // B-5: Atribución forzosa al operador en sesión
        assert.strictEqual(resComanda.body.comanda.mesero, 'Mesero de Turno');

        // 2. Intentar acción prohibida: eliminar huésped -> HTTP 403 Forbidden
        const resDelete = await simularPeticion('DELETE', '/api/huespedes/1', { headers: headersAuth });
        assert.strictEqual(resDelete.status, 403);
        assert.strictEqual(resDelete.body.error.includes('Acceso denegado'), true);

        // 3. Intentar acción prohibida: restablecer sistema -> HTTP 403 Forbidden
        const resReset = await simularPeticion('POST', '/api/sistema/restablecer', { headers: headersAuth });
        assert.strictEqual(resReset.status, 403);
    });

    it('RBAC Server-Side: Administrador autenticado tiene acceso a operaciones destructivas y auditoría', async () => {
        // Iniciar sesión como admin
        const loginRes = await simularPeticion('POST', '/api/auth/login', {
            body: { usuario: 'admin', password: 'Montserrat2026!Admin' }
        });
        const tokenAdmin = loginRes.body.token;
        const headersAdmin = { authorization: `Bearer ${tokenAdmin}` };

        // Eliminar huésped permitido para admin
        const resDelete = await simularPeticion('DELETE', '/api/huespedes/1', { headers: headersAdmin });
        assert.strictEqual(resDelete.status, 200);

        // Consultar bitácora de auditoría
        const resAudit = await simularPeticion('GET', '/api/auditoria', { headers: headersAdmin });
        assert.strictEqual(resAudit.status, 200);
        assert.strictEqual(Array.isArray(resAudit.body.eventos), true);
    });

    it('Protección contra DoS por payload excesivo: rechaza cuerpos mayores a 100 KB con HTTP 413', async () => {
        const bodyGigante = { datos: 'X'.repeat(120 * 1024) }; // 120 KB
        const res = await simularPeticion('POST', '/api/auth/login', { body: bodyGigante });
        assert.strictEqual(res.status, 413);
        assert.strictEqual(res.body.error.includes('demasiado grande'), true);
    });

});
