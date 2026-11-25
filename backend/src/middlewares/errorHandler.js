/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - MANEJADOR CENTRALIZADO DE ERRORES (ERROR HANDLER)
 * Previene la fuga de stack traces, rutas y detalles internos del servidor.
 * Mitigación AppSec: OWASP A05:2021 (Security Misconfiguration), ASVS V7.4
 * ============================================================================
 */

export function manejadorErroresGlobal(err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    const mensajeLog = err.message || 'Error no controlado';

    console.error(`[ERROR NO CONTROLADO][${new Date().toISOString()}] ${req.method} ${req.url}:`, mensajeLog);

    // En producción NUNCA se retorna el stack trace ni errores crudos de BD
    const respuestaSegura = {
        ok: false,
        error: status === 500
            ? 'Ha ocurrido un error interno en el servidor. El incidente ha sido registrado.'
            : mensajeLog
    };

    res.status(status).json(respuestaSegura);
}
