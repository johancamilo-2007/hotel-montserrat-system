/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - DOMINIO DE CAJA Y FACTURACIÓN
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * ============================================================================
 */

export const METODOS_PAGO = Object.freeze({
    EFECTIVO: 'EFECTIVO',
    TARJETA: 'TARJETA',
    TRANSFERENCIA: 'TRANSFERENCIA',
    CARGO_HABITACION: 'CARGO_HABITACION',
    PLAN_HOTEL: 'PLAN_HOTEL'
});

/**
 * Clasifica un método de pago en uno de los valores del ENUM oficial (Bloque D-1).
 * Tolera entradas históricas para migración transparente.
 * 
 * @param {string} metodo
 * @returns {'EFECTIVO'|'TARJETA'|'TRANSFERENCIA'|'CARGO_HABITACION'|'PLAN_HOTEL'}
 */
export function clasificarPago(metodo) {
    if (!metodo || typeof metodo !== 'string') return METODOS_PAGO.EFECTIVO;
    const m = metodo.toUpperCase().trim();

    if (m === METODOS_PAGO.EFECTIVO) return METODOS_PAGO.EFECTIVO;
    if (m === METODOS_PAGO.TARJETA) return METODOS_PAGO.TARJETA;
    if (m === METODOS_PAGO.TRANSFERENCIA) return METODOS_PAGO.TRANSFERENCIA;
    if (m === METODOS_PAGO.CARGO_HABITACION) return METODOS_PAGO.CARGO_HABITACION;
    if (m === METODOS_PAGO.PLAN_HOTEL) return METODOS_PAGO.PLAN_HOTEL;

    // Históricos o UI en español
    if (m.includes('HABIT') || m.includes('FOLIO') || m.includes('CARGAR A HABITACIÓN')) {
        return METODOS_PAGO.CARGO_HABITACION;
    }
    if (m.includes('PLAN') || m.includes('CORTES') || m.includes('HOTEL')) {
        return METODOS_PAGO.PLAN_HOTEL;
    }
    if (m.includes('TARJETA') || m.includes('DATÁFONO') || m.includes('DATAFONO')) {
        return METODOS_PAGO.TARJETA;
    }
    if (m.includes('TRANSF') || m.includes('NEQUI') || m.includes('BANCOLOMBIA') || m.includes('DAVIPLATA')) {
        return METODOS_PAGO.TRANSFERENCIA;
    }

    return METODOS_PAGO.EFECTIVO;
}

/**
 * Calcula el resumen de flujo de caja para un listado de comandas (Bloque A / B5 / D-3).
 * Separa de manera estricta el dinero real de caja (Efectivo/Tarjeta/Transferencia)
 * de las cuentas por cobrar (Cargos a habitación) y cortesías.
 * 
 * @param {Array<Object>} comandas
 * @param {string|null} fecha - Opcional, filtro YYYY-MM-DD
 * @returns {{
 *   totalCaja: number,
 *   efectivo: number,
 *   digital: number,
 *   cuentasPorCobrar: number,
 *   cortesias: number,
 *   comandasTotales: number
 * }}
 */
export function calcularResumenCaja(comandas = [], fecha = null) {
    if (!Array.isArray(comandas)) {
        return { totalCaja: 0, efectivo: 0, digital: 0, cuentasPorCobrar: 0, cortesias: 0, comandasTotales: 0 };
    }

    const filtradas = fecha
        ? comandas.filter(c => c && c.fecha === fecha && !c.anulada)
        : comandas.filter(c => c && !c.anulada);

    let efectivo = 0;
    let digital = 0;
    let cuentasPorCobrar = 0;
    let cortesias = 0;

    for (const c of filtradas) {
        const metodo = clasificarPago(c.metodoPago || c.metodo_pago);
        const valor = Math.max(0, Number(c.total ?? c.valor) || 0);
        const cant = Math.max(1, Number(c.cantidad) || 1);

        if (c.tipo === 'Cortesía (Plan)' || metodo === METODOS_PAGO.PLAN_HOTEL) {
            cortesias += cant;
        } else if (metodo === METODOS_PAGO.CARGO_HABITACION) {
            cuentasPorCobrar += valor;
        } else if (metodo === METODOS_PAGO.EFECTIVO) {
            efectivo += valor;
        } else if (metodo === METODOS_PAGO.TARJETA || metodo === METODOS_PAGO.TRANSFERENCIA) {
            digital += valor;
        } else {
            // Cualquier otro cobro liquidado
            efectivo += valor;
        }
    }

    const totalCaja = efectivo + digital;

    return {
        totalCaja,
        efectivo,
        digital,
        cuentasPorCobrar,
        cortesias,
        comandasTotales: filtradas.length
    };
}
