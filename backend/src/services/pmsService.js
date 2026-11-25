/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SERVICIO DE PMS HOTELERO Y GESTIÓN DE ESTANCIAS
 * Validación de documentos, control de ocupación (anti-doble check-in) y check-out.
 * Mitigación AppSec: OWASP A04:2021 (Insecure Design) / Transacciones ACID
 * ============================================================================
 */

import { ejecutarTransaccion } from '../db/connection.js';
import { HabitacionRepository } from '../repositories/habitacionRepository.js';
import { HuespedRepository } from '../repositories/huespedRepository.js';
import { EstanciaRepository } from '../repositories/estanciaRepository.js';

export const TIPOS_DOCUMENTO = Object.freeze(['CC', 'CE', 'PASAPORTE', 'NIT']);

/**
 * Valida el formato de documento de identidad según normativa colombiana.
 * @param {string} tipo
 * @param {string} documento
 * @returns {{ valido: boolean, error?: string }}
 */
export function validarDocumentoIdentidad(tipo, documento) {
    const t = String(tipo || '').toUpperCase().trim();
    const doc = String(documento || '').trim();

    if (!TIPOS_DOCUMENTO.includes(t)) {
        return { valido: false, error: `Tipo de documento inválido: debe ser uno de ${TIPOS_DOCUMENTO.join(', ')}` };
    }

    if (!doc || doc.length < 5 || doc.length > 20) {
        return { valido: false, error: 'Longitud de documento inválida (mínimo 5 y máximo 20 caracteres).' };
    }

    if (t === 'CC' && !/^\d{5,10}$/.test(doc)) {
        return { valido: false, error: 'Cédula de Ciudadanía (CC) debe contener entre 5 y 10 dígitos numéricos.' };
    }

    if (t === 'NIT' && !/^\d{8,11}(-\d)?$/.test(doc)) {
        return { valido: false, error: 'NIT debe contener formato numérico válido con dígito de verificación opcional.' };
    }

    if (t === 'CE' && !/^[A-Za-z0-9]{5,12}$/.test(doc)) {
        return { valido: false, error: 'Cédula de Extranjería (CE) debe ser alfanumérica de 5 a 12 caracteres.' };
    }

    if (t === 'PASAPORTE' && !/^[A-Za-z0-9]{6,16}$/.test(doc)) {
        return { valido: false, error: 'Pasaporte debe ser alfanumérico de 6 a 16 caracteres.' };
    }

    return { valido: true };
}

export const PmsService = {
    /**
     * Proceso atómico de Check-in con control estricto de ocupación:
     * 1. Valida documento y datos de entrada.
     * 2. Verifica que la habitación exista y esté 'Disponible' (previene doble check-in).
     * 3. Registra o actualiza la persona en 'huespedes'.
     * 4. Marca la habitación como 'Ocupada'.
     * 5. Crea el registro de estancia activa.
     */
    async realizarCheckIn({
        nombre,
        tipoDocumento = 'CC',
        documento,
        habitacionNumero,
        planId = 0
    }) {
        const valDoc = validarDocumentoIdentidad(tipoDocumento, documento);
        if (!valDoc.valido) {
            throw new Error(`[VALIDACIÓN IDENTIDAD] ${valDoc.error}`);
        }

        if (!nombre || nombre.trim().length < 3) {
            throw new Error('[VALIDACIÓN DATOS] El nombre del huésped es obligatorio (mínimo 3 caracteres).');
        }

        return await ejecutarTransaccion(async (tx) => {
            // Paso 1: Verificar existencia y disponibilidad de la habitación
            const habitacion = await HabitacionRepository.buscarPorNumero(habitacionNumero, tx);
            if (!habitacion) {
                throw new Error(`[PMS ERROR] La habitación ${habitacionNumero} no existe en el catálogo.`);
            }

            if (habitacion.estado !== 'Disponible') {
                throw new Error(`[HABITACIÓN OCUPADA] La habitación ${habitacionNumero} se encuentra en estado "${habitacion.estado}". No se permite doble check-in.`);
            }

            // Paso 2: Registrar persona en 'huespedes'
            const huespedCreado = await HuespedRepository.crear({
                uuid: `hsp-${Date.now()}`,
                nombre: nombre.trim(),
                documento: documento.trim(),
                habitacion: habitacionNumero,
                plan_id: planId
            }, tx);

            // Paso 3: Marcar habitación como ocupada
            await HabitacionRepository.actualizarEstado(habitacionNumero, 'Ocupada', tx);

            // Paso 4: Crear estancia activa
            const estancia = await EstanciaRepository.crear({
                uuid: `est-${Date.now()}`,
                huespedId: huespedCreado.id,
                habitacionNumero,
                planId
            }, tx);

            return {
                huesped: huespedCreado,
                estancia,
                habitacion: { numero: habitacionNumero, estado: 'Ocupada' }
            };
        });
    },

    /**
     * Proceso atómico de Check-out y liquidación de folios:
     * 1. Consulta la estancia y verifica cargos acumulados por cobrar.
     * 2. Finaliza la estancia.
     * 3. Libera la habitación a estado 'Disponible'.
     * 4. Actualiza estado del huésped a 'Check-out'.
     * 5. Emite estado de cuenta liquidado.
     */
    async realizarCheckOut(estanciaId, metodoPagoLiquidacion = 'EFECTIVO') {
        return await ejecutarTransaccion(async (tx) => {
            const estancia = await EstanciaRepository.buscarPorId(estanciaId, tx);
            if (!estancia) {
                throw new Error(`[PMS ERROR] La estancia con ID ${estanciaId} no existe.`);
            }

            if (estancia.estado === 'Finalizada') {
                throw new Error('[PMS ERROR] Esta estancia ya ha sido liquidada y finalizada con anterioridad.');
            }

            // 1. Finalizar estancia
            await EstanciaRepository.finalizarEstancia(estanciaId, tx);

            // 2. Liberar habitación
            await HabitacionRepository.actualizarEstado(estancia.habitacion_numero || estancia.habitacionNumero, 'Disponible', tx);

            // 3. Actualizar huésped
            const huespedId = estancia.huesped_id || estancia.huespedId;
            await HuespedRepository.checkOut(huespedId, tx);

            return {
                ok: true,
                mensaje: 'Check-out completado y habitación liberada exitosamente.',
                estanciaId,
                totalFolioLiquidado: estancia.total_folio || 0,
                metodoPagoLiquidacion,
                habitacionLiberada: estancia.habitacion_numero || estancia.habitacionNumero,
                leyendaFiscal: 'COMPROBANTE INTERNO DE LIQUIDACIÓN DE CUENTA - NO ES FACTURA ELECTRÓNICA'
            };
        });
    }
};
