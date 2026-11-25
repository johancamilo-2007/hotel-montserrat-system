/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - CONTROLADOR DE AUTENTICACIÓN Y SESIONES
 * Endpoints seguros para login con backoff, logout, reautenticación y perfil.
 * Mitigaciones AppSec: OWASP A07:2021 (Auth Failures), ASVS V2 & V3
 * ============================================================================
 */

import {
    buscarUsuario,
    obtenerEstadoBloqueo,
    registrarFalloLogin,
    limpiarFallosLogin
} from '../services/userService.js';
import {
    verificarPassword,
    derivarHashPassword,
    generarSal,
    validarPoliticaPassword
} from '../services/cryptoService.js';
import {
    crearSesion,
    destruirSesion,
    revocarTodasLasSesionesUsuario
} from '../services/sessionService.js';
import {
    registrarEventoSeguridad,
    EVENTOS_AUDITORIA
} from '../services/auditService.js';
import { NOMBRE_COOKIE_SESION, parsearCookies } from '../middlewares/authMiddleware.js';
import { env } from '../config/env.js';

export async function loginController(req, res) {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { usuario, password } = req.body || {};

    // 1. Validación de entrada sintáctica
    if (!usuario || typeof usuario !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({
            ok: false,
            error: 'Debes proporcionar usuario y contraseña válidos.'
        });
    }

    const usernameLimpio = usuario.trim().toLowerCase();
    const identificador = `${ip}_${usernameLimpio}`;

    // 2. Control de fuerza bruta en servidor (ASVS V2.2.1)
    const estadoBloqueo = obtenerEstadoBloqueo(identificador);
    if (estadoBloqueo.bloqueado) {
        registrarEventoSeguridad(EVENTOS_AUDITORIA.BRUTE_FORCE_LOCKOUT, {
            username: usernameLimpio,
            ip,
            userAgent,
            recurso: '/api/auth/login',
            resultado: 'BLOCKED',
            detalles: `Bloqueo activo por ${estadoBloqueo.segundosRestantes}s.`
        });

        return res.status(429).json({
            ok: false,
            error: `🔒 Sistema bloqueado temporalmente por exceso de intentos fallidos. Intenta nuevamente en ${estadoBloqueo.segundosRestantes} segundos.`,
            segundosRestantes: estadoBloqueo.segundosRestantes
        });
    }

    // 3. Búsqueda de usuario
    const cuenta = buscarUsuario(usernameLimpio);

    // Si el usuario no existe, simulamos verificación criptográfica para mitigar timing attacks
    if (!cuenta) {
        await verificarPassword('dummy_password_timing_pad', '00112233445566778899aabbccddeeff', '00112233445566778899aabbccddeeff');
        const fallo = registrarFalloLogin(identificador);

        registrarEventoSeguridad(EVENTOS_AUDITORIA.LOGIN_FAILED, {
            username: usernameLimpio,
            ip,
            userAgent,
            recurso: '/api/auth/login',
            resultado: 'FAILED',
            detalles: 'Usuario no encontrado'
        });

        return res.status(401).json({
            ok: false,
            error: 'Usuario o contraseña incorrectos.',
            intentos: fallo.intentos
        });
    }

    // 4. Verificación de hash con tiempo constante (ASVS V2.10.4)
    const esValido = await verificarPassword(password, cuenta.salt, cuenta.hash);

    if (!esValido) {
        const fallo = registrarFalloLogin(identificador);

        registrarEventoSeguridad(EVENTOS_AUDITORIA.LOGIN_FAILED, {
            username: usernameLimpio,
            ip,
            userAgent,
            recurso: '/api/auth/login',
            resultado: 'FAILED',
            detalles: 'Contraseña inválida'
        });

        if (fallo.bloqueado) {
            const segs = Math.ceil(fallo.penalizacionMs / 1000);
            return res.status(429).json({
                ok: false,
                error: `🔒 Has excedido el número de intentos permitidos. Sistema bloqueado por ${segs} segundos.`
            });
        }

        const restantes = Math.max(0, env.MAX_LOGIN_ATTEMPTS - fallo.intentos);
        return res.status(401).json({
            ok: false,
            error: `Usuario o contraseña incorrectos. Te quedan ${restantes} intento(s) antes del bloqueo temporal.`
        });
    }

    // 5. Autenticación exitosa
    limpiarFallosLogin(identificador);

    // Crear sesión en servidor con ID criptográfico de 256 bits
    const sesion = crearSesion(cuenta, ip, userAgent);

    // Configuración segura de la cookie de sesión (HttpOnly, Secure en prod, SameSite=Strict)
    const esProd = env.NODE_ENV === 'production';
    const cookieOptions = [
        `${NOMBRE_COOKIE_SESION}=${sesion.id}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${env.SESSION_MAX_DURATION_HOURS * 3600}`
    ];
    if (esProd) {
        cookieOptions.push('Secure');
    }

    res.setHeader('Set-Cookie', cookieOptions.join('; '));

    registrarEventoSeguridad(EVENTOS_AUDITORIA.LOGIN_SUCCESS, {
        username: cuenta.usuario,
        rol: cuenta.rol,
        ip,
        userAgent,
        recurso: '/api/auth/login',
        resultado: 'SUCCESS'
    });

    return res.status(200).json({
        ok: true,
        mensaje: 'Autenticación exitosa.',
        token: sesion.id, // Para clientes REST que usen Authorization Bearer
        usuario: {
            id: cuenta.id,
            usuario: cuenta.usuario,
            rol: cuenta.rol,
            nombre: cuenta.nombre
        }
    });
}

export function logoutController(req, res) {
    const cookies = parsearCookies(req.headers.cookie);
    const sessionId = cookies[NOMBRE_COOKIE_SESION] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (sessionId) {
        destruirSesion(sessionId);
    }

    // Limpiar cookie en el cliente
    res.setHeader('Set-Cookie', `${NOMBRE_COOKIE_SESION}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`);

    if (req.user) {
        registrarEventoSeguridad(EVENTOS_AUDITORIA.LOGOUT, {
            username: req.user.usuario,
            rol: req.user.rol,
            ip: req.ip || req.socket?.remoteAddress,
            userAgent: req.headers['user-agent'],
            resultado: 'SUCCESS'
        });
    }

    return res.status(200).json({
        ok: true,
        mensaje: 'Sesión finalizada exitosamente.'
    });
}

export function meController(req, res) {
    return res.status(200).json({
        ok: true,
        usuario: req.user
    });
}

export async function reauthController(req, res) {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ ok: false, error: 'Debes ingresar tu contraseña actual.' });
    }

    const cuenta = buscarUsuario(req.user.usuario);
    if (!cuenta) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    const esValido = await verificarPassword(password, cuenta.salt, cuenta.hash);
    if (esValido) {
        registrarEventoSeguridad(EVENTOS_AUDITORIA.REAUTH_SUCCESS, {
            username: req.user.usuario,
            rol: req.user.rol,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            resultado: 'SUCCESS'
        });
        return res.status(200).json({ ok: true, autorizado: true });
    } else {
        registrarEventoSeguridad(EVENTOS_AUDITORIA.REAUTH_FAILED, {
            username: req.user.usuario,
            rol: req.user.rol,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            resultado: 'FAILED'
        });
        return res.status(401).json({ ok: false, autorizado: false, error: 'Contraseña incorrecta. Acción no autorizada.' });
    }
}

export async function changePasswordController(req, res) {
    const { actualPassword, newPassword } = req.body || {};

    if (!actualPassword || !newPassword) {
        return res.status(400).json({ ok: false, error: 'Debes proporcionar la contraseña actual y la nueva contraseña.' });
    }

    const cuenta = buscarUsuario(req.user.usuario);
    if (!cuenta) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    // 1. Validar contraseña actual
    const esValido = await verificarPassword(actualPassword, cuenta.salt, cuenta.hash);
    if (!esValido) {
        return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta.' });
    }

    // 2. Validar política de nueva contraseña (ASVS V2.1)
    const validacionPolitica = validarPoliticaPassword(newPassword);
    if (!validacionPolitica.valida) {
        return res.status(400).json({ ok: false, error: validacionPolitica.mensaje });
    }

    // 3. Generar nueva sal y hash
    const nuevaSal = generarSal();
    const nuevoHash = await derivarHashPassword(newPassword, nuevaSal);

    cuenta.salt = nuevaSal;
    cuenta.hash = nuevoHash;
    cuenta.debeCambiarPassword = false;

    // 4. Revocar todas las sesiones previas (mitigación de sesión secuestrada - ASVS V3.3.4)
    revocarTodasLasSesionesUsuario(cuenta.usuario);

    // Crear nueva sesión para la solicitud actual
    const nuevaSesion = crearSesion(cuenta, req.ip, req.headers['user-agent']);
    res.setHeader('Set-Cookie', `${NOMBRE_COOKIE_SESION}=${nuevaSesion.id}; Path=/; HttpOnly; SameSite=Strict`);

    registrarEventoSeguridad(EVENTOS_AUDITORIA.PASSWORD_CHANGED, {
        username: cuenta.usuario,
        rol: cuenta.rol,
        ip: req.ip,
        resultado: 'SUCCESS'
    });

    return res.status(200).json({
        ok: true,
        mensaje: 'Contraseña actualizada exitosamente. Todas las sesiones anteriores han sido cerradas por seguridad.'
    });
}
