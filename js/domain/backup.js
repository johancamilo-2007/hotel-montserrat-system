/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - VALIDACIÓN ESTRICTA DE BACKUPS Y LOCALSTORAGE
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * Mitigación AppSec: OWASP A03:2021 (Injection), A08:2021 (Software/Data Integrity)
 * ============================================================================
 */

import { METODOS_PAGO } from './caja.js';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024; // 2 Megabytes límite
const ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

const CLAVES_PERMITIDAS_RAIZ = new Set([
    'schemaVersion',
    'huespedes',
    'inventario',
    'comandas',
    'cierresCaja',
    'ultimoDiaOperativo',
    'config'
]);

/**
 * Detecta si un objeto o string contiene vectores de contaminación de prototipos.
 * @param {any} val
 * @returns {boolean}
 */
function tieneProtoPollution(val) {
    if (!val || typeof val !== 'object') return false;
    for (const k of Object.keys(val)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
        if (typeof val[k] === 'object' && tieneProtoPollution(val[k])) return true;
    }
    return false;
}

/**
 * Valida de forma rigurosa y estricta el contenido de una copia de seguridad (Bloque C-3).
 * Implementa política Todo-o-Nada: si hay un solo error estructural o de integridad,
 * la importación es rechazada.
 * 
 * @param {any} obj - Objeto a validar
 * @param {number} [tamanoBytes=0] - Tamaño en bytes del origen (opcional)
 * @returns {{ ok: boolean, errores: string[], datosLimpios: Object|null }}
 */
export function validarBackup(obj, tamanoBytes = 0) {
    const errores = [];

    // 1. Control de tamaño
    if (tamanoBytes > MAX_BACKUP_BYTES) {
        errores.push(`El archivo excede el tamaño máximo permitido de 2 MB (${tamanoBytes} bytes).`);
        return { ok: false, errores, datosLimpios: null };
    }

    // 2. Control de tipo raíz
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        errores.push('La estructura raíz del backup debe ser un objeto JSON válido.');
        return { ok: false, errores, datosLimpios: null };
    }

    // 3. Protección Anti Prototype Pollution
    if (tieneProtoPollution(obj)) {
        errores.push('Se detectó intento de contaminación de prototipo (__proto__, constructor, prototype).');
        return { ok: false, errores, datosLimpios: null };
    }

    // 4. Claves permitidas en la raíz (Rechazar desconocidas)
    for (const key of Object.keys(obj)) {
        if (!CLAVES_PERMITIDAS_RAIZ.has(key)) {
            errores.push(`Clave no permitida en la raíz del backup: "${key}".`);
        }
    }

    // 5. Validar colecciones obligatorias
    if (!Array.isArray(obj.huespedes)) errores.push('El campo "huespedes" debe ser un arreglo.');
    if (!Array.isArray(obj.inventario)) errores.push('El campo "inventario" debe ser un arreglo.');
    if (!Array.isArray(obj.comandas)) errores.push('El campo "comandas" debe ser un arreglo.');

    if (errores.length > 0) {
        return { ok: false, errores, datosLimpios: null };
    }

    // Conjuntos para unicidad e integridad referencial
    const idsHuespedes = new Set();
    const idsInventario = new Set();
    const idsComandas = new Set();
    const huespedesLimpios = [];
    const inventarioLimpio = [];
    const comandasLimpias = [];
    const cierresCajaLimpios = [];

    // 6. Validación de Huéspedes
    obj.huespedes.forEach((h, idx) => {
        if (!h || typeof h !== 'object') {
            errores.push(`Huésped [${idx}] inválido: debe ser un objeto.`);
            return;
        }
        const idStr = String(h.id || '').trim();
        if (!ID_REGEX.test(idStr)) {
            errores.push(`Huésped [${idx}] tiene un ID inválido: "${idStr}".`);
        } else if (idsHuespedes.has(idStr)) {
            errores.push(`ID de huésped duplicado: "${idStr}".`);
        } else {
            idsHuespedes.add(idStr);
        }

        const planNum = parseInt(h.plan, 10);
        if (![0, 1, 2, 3].includes(planNum)) {
            errores.push(`Huésped "${idStr}" tiene plan inválido (${h.plan}). Debe ser 0, 1, 2 o 3.`);
        }

        const comidasHoy = parseInt(h.comidasHoy, 10);
        if (isNaN(comidasHoy) || comidasHoy < 0) {
            errores.push(`Huésped "${idStr}" tiene comidasHoy inválido (${h.comidasHoy}).`);
        }

        const estado = String(h.estado || '').trim();
        if (!['Activo', 'Check-out'].includes(estado)) {
            errores.push(`Huésped "${idStr}" tiene estado inválido: "${estado}".`);
        }

        huespedesLimpios.push({
            id: idStr,
            nombre: String(h.nombre || '').trim().slice(0, 120),
            documento: String(h.documento || '').trim().slice(0, 40),
            habitacion: String(h.habitacion || '').trim().slice(0, 20),
            plan: planNum,
            comidasHoy: comidasHoy || 0,
            estado: estado || 'Activo'
        });
    });

    // 7. Validación de Inventario
    obj.inventario.forEach((item, idx) => {
        if (!item || typeof item !== 'object') {
            errores.push(`Artículo de inventario [${idx}] inválido: debe ser un objeto.`);
            return;
        }
        const idStr = String(item.id || '').trim();
        if (!ID_REGEX.test(idStr)) {
            errores.push(`Artículo [${idx}] tiene un ID inválido: "${idStr}".`);
        } else if (idsInventario.has(idStr)) {
            errores.push(`ID de inventario duplicado: "${idStr}".`);
        } else {
            idsInventario.add(idStr);
        }

        const stock = parseInt(item.stock, 10);
        if (isNaN(stock) || stock < 0) {
            errores.push(`Artículo "${idStr}" tiene stock inválido (${item.stock}). Debe ser entero >= 0.`);
        }

        const stockMin = parseInt(item.stock_minimo ?? 5, 10);
        if (isNaN(stockMin) || stockMin < 0) {
            errores.push(`Artículo "${idStr}" tiene stock_minimo inválido (${item.stock_minimo}).`);
        }

        const precio = Number(item.precio);
        if (isNaN(precio) || precio < 0) {
            errores.push(`Artículo "${idStr}" tiene precio monetario inválido (${item.precio}).`);
        }

        const costo = Number(item.costo ?? 0);
        if (isNaN(costo) || costo < 0) {
            errores.push(`Artículo "${idStr}" tiene costo monetario inválido (${item.costo}).`);
        }

        inventarioLimpio.push({
            id: idStr,
            nombre: String(item.nombre || '').trim().slice(0, 120),
            categoria: String(item.categoria || 'General').trim().slice(0, 60),
            stock: stock || 0,
            stock_minimo: stockMin || 5,
            precio: precio || 0,
            costo: costo || 0
        });
    });

    // 8. Validación de Comandas e Integridad Referencial
    obj.comandas.forEach((c, idx) => {
        if (!c || typeof c !== 'object') {
            errores.push(`Comanda [${idx}] inválida: debe ser un objeto.`);
            return;
        }
        const idStr = String(c.id || '').trim();
        if (!ID_REGEX.test(idStr)) {
            errores.push(`Comanda [${idx}] tiene un ID inválido: "${idStr}".`);
        } else if (idsComandas.has(idStr)) {
            errores.push(`ID de comanda duplicado: "${idStr}".`);
        } else {
            idsComandas.add(idStr);
        }

        const fecha = String(c.fecha || '').trim();
        if (!FECHA_REGEX.test(fecha)) {
            errores.push(`Comanda "${idStr}" tiene formato de fecha inválido (${fecha}). Esperado YYYY-MM-DD.`);
        }

        const valor = Number(c.valor);
        if (isNaN(valor) || valor < 0) {
            errores.push(`Comanda "${idStr}" tiene valor monetario inválido (${c.valor}).`);
        }

        const cantidad = parseInt(c.cantidad || 1, 10);
        if (isNaN(cantidad) || cantidad < 1) {
            errores.push(`Comanda "${idStr}" tiene cantidad inválida (${c.cantidad}).`);
        }

        // Integridad referencial con huéspedes
        const idHuesped = c.idHuesped ? String(c.idHuesped).trim() : null;
        if (idHuesped && !idsHuespedes.has(idHuesped)) {
            errores.push(`Violación de integridad referencial: Comanda "${idStr}" hace referencia al huésped inexistente "${idHuesped}".`);
        }

        const tipo = String(c.tipo || '').trim();
        if (!['Cortesía (Plan)', 'Cobro'].includes(tipo)) {
            errores.push(`Comanda "${idStr}" tiene tipo inválido: "${tipo}".`);
        }

        // Validación de método de pago normalizado
        const metodoPago = String(c.metodoPago || '').trim();
        const metodosValidos = Object.values(METODOS_PAGO);
        if (metodoPago && !metodosValidos.includes(metodoPago)) {
            errores.push(`Comanda "${idStr}" tiene método de pago fuera del catálogo ENUM: "${metodoPago}".`);
        }

        comandasLimpias.push({
            id: idStr,
            fecha,
            hora: String(c.hora || '12:00').trim().slice(0, 10),
            idHuesped,
            cliente: String(c.cliente || 'Consumidor').trim().slice(0, 120),
            habitacion: String(c.habitacion || '').trim().slice(0, 20),
            mesa: String(c.mesa || '').trim().slice(0, 20),
            plato: String(c.plato || '').trim().slice(0, 120),
            comida: String(c.comida || 'Almuerzo').trim().slice(0, 30),
            cantidad,
            valor: valor || 0,
            tipo,
            metodoPago: metodoPago || METODOS_PAGO.EFECTIVO,
            mesero: String(c.mesero || 'Sistema').trim().slice(0, 80),
            anulada: Boolean(c.anulada),
            motivoAnulacion: c.motivoAnulacion ? String(c.motivoAnulacion).trim().slice(0, 255) : null
        });
    });

    // 9. Cierres de caja (si están presentes)
    if (Array.isArray(obj.cierresCaja)) {
        obj.cierresCaja.forEach((cc, idx) => {
            if (!cc || typeof cc !== 'object') return;
            cierresCajaLimpios.push({
                id: String(cc.id || `cierre-${idx}`),
                fecha: String(cc.fecha || ''),
                hora: String(cc.hora || ''),
                usuario: String(cc.usuario || 'Operador'),
                comandasCount: Number(cc.comandasCount) || 0,
                totalCaja: Number(cc.totalCaja ?? cc.total) || 0,
                totalFolios: Number(cc.totalFolios) || 0,
                efectivoContado: Number(cc.efectivoContado ?? cc.totalCaja ?? cc.total) || 0,
                diferencia: Number(cc.diferencia) || 0,
                motivoReapertura: cc.motivoReapertura ? String(cc.motivoReapertura).slice(0, 255) : null
            });
        });
    }

    // 10. Configuración institucional
    const configLimpia = {
        razonSocial: 'Hotel Montserrat S.A.S.',
        nit: obj.config?.nit ? String(obj.config.nit).trim().slice(0, 30) : '',
        direccion: obj.config?.direccion ? String(obj.config.direccion).trim().slice(0, 120) : '',
        telefono: obj.config?.telefono ? String(obj.config.telefono).trim().slice(0, 40) : '',
        regimen: 'Régimen Común / Ordinario'
    };

    if (errores.length > 0) {
        return { ok: false, errores, datosLimpios: null };
    }

    const datosLimpios = {
        schemaVersion: 3,
        ultimoDiaOperativo: String(obj.ultimoDiaOperativo || FECHA_REGEX.test(obj.ultimoDiaOperativo) ? obj.ultimoDiaOperativo : '2026-11-25'),
        huespedes: huespedesLimpios,
        inventario: inventarioLimpio,
        comandas: comandasLimpias,
        cierresCaja: cierresCajaLimpios,
        config: configLimpia
    };

    return { ok: true, errores: [], datosLimpios };
}
