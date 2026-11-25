/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - DOMINIO DE FECHAS (ZONA HORARIA AMERICA/BOGOTA)
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * ============================================================================
 */

export const ZONA_HORARIA = 'America/Bogota';

/**
 * Retorna la fecha actual o provista en formato YYYY-MM-DD en zona horaria America/Bogota (COT - UTC-5).
 * Resuelve el defecto B6 que causaba desfases de día a las 7:00 PM COT al usar toISOString().
 * 
 * @param {Date|number|string} [date=new Date()]
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function fechaBogota(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(d);
}

/**
 * Retorna la hora actual o provista en formato HH:mm en zona horaria America/Bogota.
 * 
 * @param {Date|number|string} [date=new Date()]
 * @returns {string} Hora en formato HH:mm (24 horas)
 */
export function horaBogota(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: ZONA_HORARIA,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(new Date());
    }
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: ZONA_HORARIA,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(d);
}

/**
 * Determina si ha ocurrido un cambio de día calendario entre el último día operativo y el momento actual.
 * (Bloque A / B7).
 * 
 * @param {string} ultimoDia - Formato YYYY-MM-DD
 * @param {Date|number|string} [ahora=new Date()]
 * @returns {boolean} True si cruzó la medianoche
 */
export function cambioDeDia(ultimoDia, ahora = new Date()) {
    if (!ultimoDia || typeof ultimoDia !== 'string') return true;
    const diaActual = fechaBogota(ahora);
    return ultimoDia.trim() !== diaActual;
}
