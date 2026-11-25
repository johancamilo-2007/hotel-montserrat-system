/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - APLICACIÓN PRINCIPAL DE BACKEND (EXPRESS / HTTP)
 * Servidor HTTP modular con hardening de cabeceras, CORS y pipeline de seguridad.
 * Mitigaciones AppSec: OWASP Top 10 (2021) / ASVS Level 2
 * ============================================================================
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aplicarCabecerasSeguridad } from './middlewares/securityHeaders.js';
import { aplicarCORS } from './middlewares/corsMiddleware.js';
import { manejadorErroresGlobal } from './middlewares/errorHandler.js';
import { configurarRutasAuth } from './routes/authRoutes.js';
import { configurarRutasNegocio } from './routes/apiRoutes.js';
import { inicializarUsuariosDemo } from './services/userService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function servirArchivoEstatico(req, res, pathname) {
    let rutaRelativa = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const rutaAbsoluta = path.normalize(path.resolve(ROOT_DIR, rutaRelativa));

    // Mitigación Path Traversal (OWASP A01:2021)
    if (!rutaAbsoluta.startsWith(ROOT_DIR)) {
        res.status(403).json({ ok: false, error: 'Acceso denegado.' });
        return true;
    }

    if (fs.existsSync(rutaAbsoluta) && fs.statSync(rutaAbsoluta).isFile()) {
        const ext = path.extname(rutaAbsoluta).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        const stream = fs.createReadStream(rutaAbsoluta);
        stream.pipe(res);
        return true;
    }

    return false;
}

export function crearApp() {
    const middlewaresGlobales = [];
    const rutas = [];

    // Estructura de mini-framework Express-compatible nativo (100% interoperable)
    const app = {
        use(fn) {
            middlewaresGlobales.push(fn);
        },
        get(pathPattern, ...handlers) {
            rutas.push({ method: 'GET', path: pathPattern, handlers });
        },
        post(pathPattern, ...handlers) {
            rutas.push({ method: 'POST', path: pathPattern, handlers });
        },
        delete(pathPattern, ...handlers) {
            rutas.push({ method: 'DELETE', path: pathPattern, handlers });
        },

        // Manejador principal de peticiones entrantes
        async handle(req, res) {
            // Extender res con utilidades estándar Express
            res.status = function(code) {
                this.statusCode = code;
                return this;
            };
            res.json = function(data) {
                if (this.writableEnded) return this;
                if (!this.getHeader || !this.getHeader('Content-Type')) {
                    this.setHeader('Content-Type', 'application/json; charset=utf-8');
                }
                this.end(JSON.stringify(data));
                return this;
            };

            const urlParsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = urlParsed.pathname;
            req.path = pathname;
            req.ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

            try {
                // 1. Ejecutar pipeline de middlewares globales
                for (const mw of middlewaresGlobales) {
                    let nextCalled = false;
                    await mw(req, res, () => { nextCalled = true; });
                    if (!nextCalled) return; // Middleware finalizó la petición
                }

                // 2. Parseo de body JSON con límite estricto de tamaño (100 KB - ASVS V5.1)
                if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                    await new Promise((resolve, reject) => {
                        let body = '';
                        let bytes = 0;
                        let rechazadoPorTamano = false;
                        const MAX_BYTES = 100 * 1024; // 100 KB

                        req.on('data', chunk => {
                            if (rechazadoPorTamano) return;
                            bytes += chunk.length;
                            if (bytes > MAX_BYTES) {
                                rechazadoPorTamano = true;
                                res.status(413).json({ ok: false, error: 'Cuerpo de la petición demasiado grande (Máx 100 KB).' });
                                req.destroy();
                                return resolve();
                            }
                            body += chunk;
                        });

                        req.on('end', () => {
                            if (rechazadoPorTamano || res.writableEnded) {
                                return resolve();
                            }
                            if (body.trim() && req.headers['content-type']?.includes('application/json')) {
                                try {
                                    req.body = JSON.parse(body);
                                } catch (e) {
                                    res.status(400).json({ ok: false, error: 'Formato JSON inválido en el cuerpo de la petición.' });
                                    return resolve();
                                }
                            } else {
                                req.body = {};
                            }
                            resolve();
                        });

                        req.on('error', (err) => {
                            if (!rechazadoPorTamano && !res.writableEnded) {
                                reject(err);
                            }
                        });
                    });

                    if (res.writableEnded) return;
                }

                // 3. Emparejamiento y ejecución de rutas
                const coincidencia = rutas.find(r => {
                    if (r.method !== req.method) return false;
                    // Soporte simple para rutas con parámetro :id
                    if (r.path.includes('/:')) {
                        const regexStr = '^' + r.path.replace(/:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)') + '$';
                        const match = pathname.match(new RegExp(regexStr));
                        if (match) {
                            req.params = match.groups || {};
                            return true;
                        }
                        return false;
                    }
                    return r.path === pathname;
                });

                if (coincidencia) {
                    for (const handler of coincidencia.handlers) {
                        let nextCalled = false;
                        await handler(req, res, () => { nextCalled = true; });
                        if (!nextCalled || res.writableEnded) return;
                    }
                } else if (req.method === 'GET' && !pathname.startsWith('/api')) {
                    const servido = servirArchivoEstatico(req, res, pathname);
                    if (!servido) {
                        res.status(404).json({ ok: false, error: `Recurso no encontrado: ${req.method} ${pathname}` });
                    }
                } else {
                    res.status(404).json({ ok: false, error: `Recurso no encontrado: ${req.method} ${pathname}` });
                }
            } catch (err) {
                manejadorErroresGlobal(err, req, res);
            }
        }
    };

    // Registrar middlewares globales de hardening
    app.use(aplicarCabecerasSeguridad);
    app.use(aplicarCORS);

    // Registrar rutas de autenticación y negocio
    configurarRutasAuth(app);
    configurarRutasNegocio(app);

    return app;
}

export async function iniciarServidor(puerto = 4000) {
    await inicializarUsuariosDemo();
    const app = crearApp();
    const server = http.createServer((req, res) => app.handle(req, res));

    return new Promise((resolve) => {
        server.listen(puerto, () => {
            console.log(`[Hotel Montserrat] Servidor seguro de producción activo en http://localhost:${puerto}`);
            resolve(server);
        });
    });
}
