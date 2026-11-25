/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - DOMINIO DE INVENTARIO CRÍTICO (SISTEMA STOP)
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * ============================================================================
 */

export const ESTADO_STOCK = Object.freeze({
    CRITICO: 'CRITICO',
    BAJO: 'BAJO',
    OPTIMO: 'OPTIMO'
});

/**
 * Determina el estado de semáforo de un artículo de inventario (Bloque A / B9).
 * - CRITICO: stock < stock_minimo (Alerta STOP)
 * - BAJO: stock <= stock_minimo * 2
 * - OPTIMO: stock > stock_minimo * 2
 * 
 * @param {Object} item
 * @param {number} [item.stock]
 * @param {number} [item.stock_minimo]
 * @returns {'CRITICO'|'BAJO'|'OPTIMO'}
 */
export function estadoStock(item) {
    if (!item || typeof item !== 'object') return ESTADO_STOCK.CRITICO;
    const stockMinimo = Number.isFinite(Number(item.stock_minimo)) ? Number(item.stock_minimo) : 5;
    const stock = Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0;

    if (stock < stockMinimo) {
        return ESTADO_STOCK.CRITICO;
    }
    if (stock <= stockMinimo * 2) {
        return ESTADO_STOCK.BAJO;
    }
    return ESTADO_STOCK.OPTIMO;
}

/**
 * Valida si un producto dispone de existencias para suplir la cantidad solicitada.
 * 
 * @param {Object} item
 * @param {number} cantidad
 * @returns {boolean}
 */
export function hayStockDisponible(item, cantidad = 1) {
    if (!item) return false;
    const stock = Number(item.stock) || 0;
    const req = Math.max(1, Number(cantidad) || 1);
    return stock >= req;
}
