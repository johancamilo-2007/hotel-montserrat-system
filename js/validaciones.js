/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - VALIDACIONES Y SANITIZACIÓN (MÓDULO ES)
 * Capa de sanitización segura, codificación contextual, validación y formateo.
 * Mitigaciones AppSec: OWASP A03:2021 (Injection), A04:2021 (Insecure Design)
 * ============================================================================
 */

import { fechaBogota, horaBogota, cambioDeDia } from './domain/fechas.js';
import { estadoStock, hayStockDisponible } from './domain/inventario.js';
import { repartirCortesias } from './domain/planes.js';
import { clasificarPago, calcularResumenCaja, METODOS_PAGO } from './domain/caja.js';
import { validarBackup } from './domain/backup.js';
import { migrar } from './domain/migraciones.js';

// Reexportar módulos de dominio para consumo centralizado si es necesario
export {
    fechaBogota,
    horaBogota,
    cambioDeDia,
    estadoStock,
    hayStockDisponible,
    repartirCortesias,
    clasificarPago,
    calcularResumenCaja,
    METODOS_PAGO,
    validarBackup,
    migrar
};

/**
 * Verifica si un valor es nulo, indefinido o solo espacios en blanco.
 * @param {any} valor
 * @returns {boolean}
 */
export function campoVacio(valor) {
    if (valor === null || valor === undefined) return true;
    return String(valor).trim() === '';
}

/**
 * Valida que una cadena contenga únicamente letras y tildes/espacios en español.
 * Permite nombres legítimos con apóstrofes o guiones (ej. O'Brien, Jean-Pierre).
 * @param {string} texto
 * @returns {boolean}
 */
export function soloLetras(texto) {
    if (campoVacio(texto)) return false;
    return /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s.'-]+$/.test(String(texto).trim());
}

/**
 * Valida que contenga solo dígitos numéricos enteros positivos.
 * @param {any} texto
 * @returns {boolean}
 */
export function soloNumeros(texto) {
    if (campoVacio(texto)) return false;
    return /^\d+$/.test(String(texto).trim());
}

/**
 * Valida documentos de identidad tanto nacionales (cédula numéricas) como
 * extranjeros / pasaportes alfanuméricos (ej. PA123456, 10203040).
 * @param {string} texto
 * @returns {boolean}
 */
export function esDocumentoValido(texto) {
    if (campoVacio(texto)) return false;
    return /^[a-zA-Z0-9\s\-]{4,20}$/.test(String(texto).trim());
}

/**
 * Valida un identificador de habitación (ej: 101, 204B, Suite-1, PH2).
 * @param {string} texto
 * @returns {boolean}
 */
export function esHabitacionValida(texto) {
    if (campoVacio(texto)) return false;
    return /^[a-zA-Z0-9\s\-]{1,10}$/.test(String(texto).trim());
}

/**
 * Sanitización segura (B11): Limpia caracteres de control invisibles y espacios
 * sin destruir datos legítimos como apóstrofes, comillas, ampersands o paréntesis.
 * La prevención de XSS se delega a escapeHTML(), escapeAttr() y textContent.
 * @param {string} texto
 * @returns {string}
 */
export function sanitizar(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .trim();
}

/**
 * Escapa caracteres HTML para renderizado seguro en DOM (previene XSS - ASVS V5.1.2).
 * @param {any} texto
 * @returns {string}
 */
export function escapeHTML(texto) {
    if (texto === null || texto === undefined) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '`': '&#x60;'
    };
    return String(texto).replace(/[&<>"'`]/g, m => map[m]);
}

/**
 * Escapa caracteres para su inclusión segura dentro de atributos HTML (Bloque C-1).
 * @param {any} texto
 * @returns {string}
 */
export function escapeAttr(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Verifica si un documento de identidad ya está activo en el hotel (B8).
 * Solo bloquea si existe un huésped ACTIVO. Permite reingresos de huéspedes con Check-out.
 * @param {string} doc
 * @param {Array<Object>} huespedes - Colección de huéspedes
 * @param {string|null} [excludeId=null]
 * @returns {boolean}
 */
export function documentoExiste(doc, huespedes = [], excludeId = null) {
    if (!Array.isArray(huespedes)) return false;
    const limpio = String(doc || '').trim().toUpperCase();
    return huespedes.some(h => 
        String(h.documento).trim().toUpperCase() === limpio && 
        h.estado !== 'Check-out' && 
        (excludeId === null || String(h.id) !== String(excludeId))
    );
}

/**
 * Valida longitud mínima requerida en un texto.
 * @param {string} texto
 * @param {number} min
 * @returns {boolean}
 */
export function longitudMinima(texto, min) {
    if (campoVacio(texto)) return false;
    return String(texto).trim().length >= min;
}

/**
 * Valida que un número sea positivo mayor a cero.
 * @param {any} valor
 * @returns {boolean}
 */
export function numeroPositivo(valor) {
    const num = Number(valor);
    return !isNaN(num) && num > 0;
}

/**
 * Formatea un número como moneda colombiana (COP).
 * @param {number|string} valor
 * @returns {string}
 */
export function formatoMoneda(valor) {
    const num = Number(valor) || 0;
    return '$ ' + num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Formatea fecha y hora en formato legible en español para Colombia.
 * @param {Date|number|string} [fecha=new Date()]
 * @returns {string}
 */
export function formatoFechaHora(fecha = new Date()) {
    const d = (fecha instanceof Date) ? fecha : new Date(fecha);
    return d.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Generador seguro de identificadores únicos universales (UUID v4 - B10).
 * @returns {string}
 */
export function generarUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}
