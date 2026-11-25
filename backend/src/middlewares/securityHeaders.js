/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - CABECERAS DE SEGURIDAD HTTP (HARDENING)
 * Mitigaciones AppSec: OWASP A05:2021 (Security Misconfiguration), ASVS V14.4
 * ============================================================================
 */

export function aplicarCabecerasSeguridad(req, res, next) {
    // 1. Content Security Policy (CSP) Estricta (ASVS V14.4.3)
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
    );

    // 2. HTTP Strict Transport Security (HSTS) (ASVS V14.4.5)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // 3. Prevenir sniffing de tipo MIME (ASVS V14.4.4)
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 4. Protección Anti-Clickjacking (ASVS V14.4.1)
    res.setHeader('X-Frame-Options', 'DENY');

    // 5. Política de Referrer estricta (ASVS V14.4.7)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 6. Restricción de capacidades del navegador (Permissions-Policy)
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

    // 7. Aislamiento de origen cruzado
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // 8. Ocultar huellas de tecnologías de servidor (X-Powered-By)
    res.removeHeader('X-Powered-By');

    next();
}
