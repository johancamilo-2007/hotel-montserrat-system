/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - MIDDLEWARE DE AUTORIZACIÓN RBAC (SERVER-SIDE)
 * Verificación estricta de permisos con política Deny-by-Default en cada endpoint.
 * Mitigaciones AppSec: OWASP A01:2021 (Broken Access Control), ASVS V4.1
 * ============================================================================
 */

import { usuarioTienePermiso } from '../services/userService.js';
import { registrarEventoSeguridad, EVENTOS_AUDITORIA } from '../services/auditService.js';

/**
 * Genera un middleware que exige un permiso específico para acceder a la ruta.
 * @param {string} accion - Acción requerida según la matriz PERMISOS
 */
export function requerirPermiso(accion) {
    return (req, res, next) => {
        if (!req.user || !req.user.rol) {
            return res.status(401).json({
                ok: false,
                error: 'No autorizado: Usuario no autenticado.'
            });
        }

        const tienePermiso = usuarioTienePermiso(req.user.rol, accion);

        if (!tienePermiso) {
            registrarEventoSeguridad(EVENTOS_AUDITORIA.PERMISSION_DENIED, {
                username: req.user.usuario,
                rol: req.user.rol,
                ip: req.ip || req.socket?.remoteAddress,
                userAgent: req.headers['user-agent'],
                recurso: req.originalUrl || req.url,
                resultado: 'DENIED',
                detalles: `El rol "${req.user.rol}" intentó ejecutar la acción "${accion}" sin autorización.`
            });

            return res.status(403).json({
                ok: false,
                error: `Acceso denegado: Tu rol (${req.user.rol}) no tiene autorización para ejecutar "${accion}".`
            });
        }

        next();
    };
}
