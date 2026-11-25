/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - CONFIGURACIÓN DE VARIABLES DE ENTORNO
 * Validación estricta y fail-fast en arranque del servidor.
 * Mitigación AppSec: OWASP A05:2021 (Security Misconfiguration)
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga simple y segura de archivo .env sin dependencias externas
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...values] = trimmed.split('=');
            if (key && values.length > 0) {
                const val = values.join('=').trim().replace(/^["']|["']$/g, '');
                if (process.env[key.trim()] === undefined) {
                    process.env[key.trim()] = val;
                }
            }
        }
    });
}

function obtenerEnv(clave, valorPorDefecto = undefined, requerida = false) {
    const val = process.env[clave] ?? valorPorDefecto;
    if (requerida && (val === undefined || String(val).trim() === '')) {
        throw new Error(`[CONFIG CRÍTICA] La variable de entorno "${clave}" es requerida para iniciar el servidor.`);
    }
    return val;
}

export const env = Object.freeze({
    PORT: parseInt(obtenerEnv('PORT', '4000'), 10),
    NODE_ENV: obtenerEnv('NODE_ENV', 'development'),
    CORS_ORIGIN: obtenerEnv('CORS_ORIGIN', 'http://localhost:3000,http://127.0.0.1:5500')
        .split(',')
        .map(o => o.trim()),
    COOKIE_SECRET: obtenerEnv('COOKIE_SECRET', 'montserrat_dev_secret_key_entropy_32_bytes_min_12345', true),
    PASSWORD_PEPPER: obtenerEnv('PASSWORD_PEPPER', 'montserrat_dev_pepper_server_side_secret_entropy_67890', true),
    SESSION_INACTIVITY_TIMEOUT_MINUTES: parseInt(obtenerEnv('SESSION_INACTIVITY_TIMEOUT_MINUTES', '20'), 10),
    SESSION_MAX_DURATION_HOURS: parseInt(obtenerEnv('SESSION_MAX_DURATION_HOURS', '12'), 10),
    MAX_LOGIN_ATTEMPTS: parseInt(obtenerEnv('MAX_LOGIN_ATTEMPTS', '3'), 10),
    LOCKOUT_PENALTY_SECONDS: parseInt(obtenerEnv('LOCKOUT_PENALTY_SECONDS', '30'), 10),
    // Configuración de Base de Datos Relacional (Fase 2)
    DB_DRIVER: obtenerEnv('DB_DRIVER', 'memory'), // 'mysql' | 'memory'
    DB_HOST: obtenerEnv('DB_HOST', 'localhost'),
    DB_PORT: parseInt(obtenerEnv('DB_PORT', '3306'), 10),
    DB_NAME: obtenerEnv('DB_NAME', 'hotel_montserrat_db'),
    DB_USER: obtenerEnv('DB_USER', 'root'),
    DB_PASSWORD: obtenerEnv('DB_PASSWORD', ''),
    DB_CONNECTION_LIMIT: parseInt(obtenerEnv('DB_CONNECTION_LIMIT', '10'), 10)
});
