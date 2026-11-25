/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - CLIENTE API REST CENTRALIZADO (FRONTEND)
 * Manejo uniforme de peticiones HTTP, credenciales, tokens y tipado de errores.
 * Mitigación AppSec: OWASP A07:2021 (Gestión de credenciales con cookies seguras)
 * ============================================================================
 */

import { obtenerUsuarioActual } from './seguridad.js';

class ApiClientError extends Error {
    constructor(mensaje, status = 500, data = null) {
        super(mensaje);
        this.name = 'ApiClientError';
        this.status = status;
        this.data = data;
    }
}

export const ApiClient = {
    /**
     * Construye las cabeceras estándar para peticiones a la API REST.
     */
    obtenerHeaders(customHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...customHeaders
        };

        const usuario = obtenerUsuarioActual();
        if (usuario && usuario.token) {
            headers['Authorization'] = `Bearer ${usuario.token}`;
        }

        return headers;
    },

    /**
     * Ejecuta una petición HTTP genérica con manejo de timeouts y errores.
     */
    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${endpoint}`;
        const config = {
            ...options,
            credentials: 'include', // Para cookies HttpOnly de sesión en servidor
            headers: this.obtenerHeaders(options.headers)
        };

        try {
            const response = await fetch(url, config);
            let respuestaJson = null;

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                respuestaJson = await response.json();
            }

            if (!response.ok) {
                const mensajeError = respuestaJson?.error || `Error ${response.status}: ${response.statusText}`;
                throw new ApiClientError(mensajeError, response.status, respuestaJson);
            }

            return respuestaJson || { ok: true, status: response.status };
        } catch (error) {
            if (error instanceof ApiClientError) {
                throw error;
            }
            throw new ApiClientError(
                error.message || 'Error de comunicación con el servidor. Verifica tu conexión.',
                0,
                null
            );
        }
    },

    async get(endpoint) {
        return await this.request(endpoint, { method: 'GET' });
    },

    async post(endpoint, body = {}) {
        return await this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    async delete(endpoint) {
        return await this.request(endpoint, { method: 'DELETE' });
    }
};
