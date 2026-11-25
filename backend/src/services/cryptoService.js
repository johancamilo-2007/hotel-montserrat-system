/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SERVICIO CRIPTOGRÁFICO DE SEGURIDAD (SERVER-SIDE)
 * Hashing seguro con PBKDF2/Argon2id + Pepper, tokens de 256 bits y timing-safe.
 * Mitigaciones AppSec: OWASP A02:2021 (Cryptographic Failures), ASVS V2.4 / V2.10
 * ============================================================================
 */

import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const ITERACIONES_PBKDF2 = 310000;
export const KEYLEN_BYTES = 32; // 256 bits
export const DIGEST = 'sha256';

/**
 * Genera una sal criptográfica segura de alta entropía (16 bytes / 128 bits).
 * @returns {string} Sal en formato hexadecimal
 */
export function generarSal() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Genera un token aleatorio criptográfico de 256 bits (32 bytes).
 * @returns {string} Token hexadecimal
 */
export function generarTokenSeguro() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Deriva un hash seguro de contraseña aplicando sal individual + pepper de servidor.
 * Protege contra tablas arcoíris y ataques de diccionario masivos.
 * 
 * @param {string} password - Contraseña en texto plano
 * @param {string} salt - Sal única del usuario
 * @returns {Promise<string>} Hash en formato hexadecimal
 */
export async function derivarHashPassword(password, salt) {
    if (typeof password !== 'string' || !password) {
        throw new Error('La contraseña debe ser una cadena no vacía.');
    }
    // Combinación con el pepper secreto del servidor
    const secretInput = password + env.PASSWORD_PEPPER;

    return new Promise((resolve, reject) => {
        crypto.pbkdf2(secretInput, salt, ITERACIONES_PBKDF2, KEYLEN_BYTES, DIGEST, (err, derivedKey) => {
            if (err) return reject(err);
            resolve(derivedKey.toString('hex'));
        });
    });
}

/**
 * Verifica una contraseña en tiempo constante contra un hash almacenado.
 * Mitiga ataques de enumeración por análisis de tiempo (Timing Attacks - ASVS V2.10.4).
 * 
 * @param {string} password - Contraseña provista por el usuario
 * @param {string} salt - Sal almacenada
 * @param {string} hashEsperado - Hash almacenado
 * @returns {Promise<boolean>}
 */
export async function verificarPassword(password, salt, hashEsperado) {
    if (!password || !salt || !hashEsperado) return false;
    const hashCalculado = await derivarHashPassword(password, salt);

    const bufCalculado = Buffer.from(hashCalculado, 'hex');
    const bufEsperado = Buffer.from(hashEsperado, 'hex');

    if (bufCalculado.length !== bufEsperado.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufCalculado, bufEsperado);
}

/**
 * Valida la política de contraseñas de producción (ASVS V2.1):
 * - Mínimo 12 caracteres.
 * - Al menos una mayúscula, una minúscula, un número y un símbolo especial.
 * - Rechaza contraseñas triviales o de listas conocidas.
 * 
 * @param {string} password
 * @returns {{ valida: boolean, mensaje?: string }}
 */
export function validarPoliticaPassword(password) {
    if (typeof password !== 'string' || password.length < 12) {
        return { valida: false, mensaje: 'La contraseña debe contener un mínimo de 12 caracteres.' };
    }

    const tieneMayuscula = /[A-Z]/.test(password);
    const tieneMinuscula = /[a-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    const tieneSimbolo = /[^A-Za-z0-9]/.test(password);

    if (!tieneMayuscula || !tieneMinuscula || !tieneNumero || !tieneSimbolo) {
        return {
            valida: false,
            mensaje: 'La contraseña debe incluir al menos una mayúscula, una minúscula, un número y un carácter especial.'
        };
    }

    // Lista negra básica de contraseñas comunes prohibidas
    const listaNegra = ['Password123!', 'Admin123456!', 'Montserrat2026!', 'Hotel1234567!'];
    if (listaNegra.includes(password)) {
        return { valida: false, mensaje: 'La contraseña seleccionada es demasiado común o predecible.' };
    }

    return { valida: true };
}
