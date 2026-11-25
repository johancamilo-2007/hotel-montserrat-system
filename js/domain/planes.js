/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - DOMINIO DE PLANES DE ALIMENTACIÓN
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * ============================================================================
 */

/**
 * Reparte una solicitud de comandas entre cortesías otorgadas por el plan
 * y excedentes a facturar (Bloque A / B3).
 * 
 * @param {Object} params
 * @param {number|string} params.plan - Número de comidas del plan (0, 1, 2, 3)
 * @param {number|string} params.comidasHoy - Comidas ya servidas en el día
 * @param {number|string} params.cantidad - Cantidad de platos pedidos en la orden
 * @returns {{ cortesias: number, excedente: number }}
 */
export function repartirCortesias({ plan = 0, comidasHoy = 0, cantidad = 1 } = {}) {
    const p = Math.max(0, parseInt(plan, 10) || 0);
    const cHoy = Math.max(0, parseInt(comidasHoy, 10) || 0);
    const cant = Math.max(1, parseInt(cantidad, 10) || 1);

    const cupoDisponible = Math.max(0, p - cHoy);
    const cortesias = Math.min(cant, cupoDisponible);
    const excedente = Math.max(0, cant - cortesias);

    return { cortesias, excedente };
}
