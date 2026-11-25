/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - MIGRACIÓN Y VERSIONADO DE BASE DE DATOS LOCAL
 * Funciones puras (sin dependencias de DOM, window ni storage)
 * Bloque E: schemaVersion = 3, migración idempotente.
 * ============================================================================
 */

import { clasificarPago } from './caja.js';

export const SCHEMA_VERSION_ACTUAL = 3;

/**
 * Migra cualquier estructura de base de datos local a la versión de esquema actual (v3).
 * Es 100% IDEMPOTENTE: ejecutarla dos o más veces sobre los mismos datos produce
 * el mismo resultado exacto sin mutaciones secundarias ni pérdida de datos.
 * 
 * Reglas de migración:
 * 1. Pasa IDs numéricos a string manteniendo la integridad referencial (idHuesped).
 * 2. Normaliza el método de pago al catálogo ENUM oficial (clasificarPago).
 * 3. Convierte cierres viejos (total -> totalCaja, inicializa totalFolios = 0 si falta).
 * 4. Agrega stock_minimo (por defecto 5) en inventario si no existe.
 * 5. Agrega objeto config institucional con valores por defecto.
 * 6. Establece schemaVersion = 3.
 * 
 * @param {Object} db - Estado de base de datos a migrar
 * @returns {Object} Base de datos normalizada en versión 3
 */
export function migrar(db) {
    if (!db || typeof db !== 'object') {
        return crearEstadoInicial();
    }

    // Copia profunda para no mutar el input directamente
    const clon = JSON.parse(JSON.stringify(db));

    // Mapa para mapear IDs viejos (por si eran números) a strings
    const mapaIdsHuesped = new Map();

    // 1. Migrar Huéspedes
    const huespedes = Array.isArray(clon.huespedes) ? clon.huespedes : [];
    const huespedesMigrados = huespedes.map((h, idx) => {
        const idOriginal = h.id;
        const idString = String(idOriginal !== undefined && idOriginal !== null ? idOriginal : `h-${idx + 1}`);
        mapaIdsHuesped.set(String(idOriginal), idString);

        return {
            id: idString,
            nombre: String(h.nombre || '').trim(),
            documento: String(h.documento || '').trim(),
            habitacion: String(h.habitacion || '').trim(),
            plan: Number.isInteger(Number(h.plan)) ? Number(h.plan) : 0,
            comidasHoy: Math.max(0, Number(h.comidasHoy) || 0),
            estado: h.estado === 'Check-out' ? 'Check-out' : 'Activo'
        };
    });

    // 2. Migrar Inventario
    const inventario = Array.isArray(clon.inventario) ? clon.inventario : [];
    const inventarioMigrado = inventario.map((item, idx) => {
        const idString = String(item.id !== undefined && item.id !== null ? item.id : `p-${idx + 1}`);
        const stockMinimo = Number.isFinite(Number(item.stock_minimo)) ? Number(item.stock_minimo) : 5;

        return {
            id: idString,
            nombre: String(item.nombre || '').trim(),
            categoria: String(item.categoria || 'General').trim(),
            stock: Math.max(0, Number(item.stock) || 0),
            stock_minimo: stockMinimo,
            precio: Math.max(0, Number(item.precio) || 0),
            costo: Math.max(0, Number(item.costo) || 0)
        };
    });

    // 3. Migrar Comandas
    const comandas = Array.isArray(clon.comandas) ? clon.comandas : [];
    const comandasMigradas = comandas.map((c, idx) => {
        const idString = String(c.id !== undefined && c.id !== null ? c.id : `com-${idx + 1}`);
        
        // Mantener integridad con huésped
        let idHuespedMigrado = null;
        if (c.idHuesped !== undefined && c.idHuesped !== null && c.idHuesped !== '') {
            const rawH = String(c.idHuesped);
            idHuespedMigrado = mapaIdsHuesped.get(rawH) || rawH;
        }

        const metodoNormalizado = clasificarPago(c.metodoPago);

        return {
            id: idString,
            fecha: String(c.fecha || '').trim(),
            hora: String(c.hora || '').trim(),
            idHuesped: idHuespedMigrado,
            cliente: String(c.cliente || 'Consumidor').trim(),
            habitacion: String(c.habitacion || '').trim(),
            mesa: String(c.mesa || '').trim(),
            plato: String(c.plato || '').trim(),
            comida: String(c.comida || 'Almuerzo').trim(),
            cantidad: Math.max(1, Number(c.cantidad) || 1),
            valor: Math.max(0, Number(c.valor) || 0),
            tipo: c.tipo === 'Cortesía (Plan)' ? 'Cortesía (Plan)' : 'Cobro',
            metodoPago: metodoNormalizado,
            mesero: String(c.mesero || 'Sistema').trim(),
            anulada: Boolean(c.anulada),
            motivoAnulacion: c.motivoAnulacion ? String(c.motivoAnulacion).trim() : null
        };
    });

    // 4. Migrar Cierres de Caja
    const cierres = Array.isArray(clon.cierresCaja) ? clon.cierresCaja : [];
    const cierresMigrados = cierres.map((cc, idx) => {
        const totalCaja = Number(cc.totalCaja !== undefined ? cc.totalCaja : cc.total) || 0;
        const totalFolios = Number(cc.totalFolios) || 0;
        const efectivoContado = Number(cc.efectivoContado !== undefined ? cc.efectivoContado : totalCaja);
        const diferencia = Number(cc.diferencia) || (efectivoContado - totalCaja);

        return {
            id: String(cc.id || `cierre-${idx + 1}`),
            fecha: String(cc.fecha || '').trim(),
            hora: String(cc.hora || '').trim(),
            usuario: String(cc.usuario || 'Operador').trim(),
            comandasCount: Number(cc.comandasCount) || 0,
            totalCaja,
            totalFolios,
            efectivoContado,
            diferencia,
            motivoReapertura: cc.motivoReapertura ? String(cc.motivoReapertura).trim() : null
        };
    });

    // 5. Configuración institucional
    const configMigrada = {
        razonSocial: 'Hotel Montserrat S.A.S.',
        nit: clon.config?.nit ? String(clon.config.nit).trim() : '',
        direccion: clon.config?.direccion ? String(clon.config.direccion).trim() : '',
        telefono: clon.config?.telefono ? String(clon.config.telefono).trim() : '',
        regimen: 'Régimen Común / Ordinario'
    };

    return {
        schemaVersion: SCHEMA_VERSION_ACTUAL,
        ultimoDiaOperativo: String(clon.ultimoDiaOperativo || '2026-11-25'),
        huespedes: huespedesMigrados,
        inventario: inventarioMigrado,
        comandas: comandasMigradas,
        cierresCaja: cierresMigrados,
        config: configMigrada
    };
}

/**
 * Retorna el estado por defecto del sistema bajo esquema v3.
 */
export function crearEstadoInicial() {
    return {
        schemaVersion: SCHEMA_VERSION_ACTUAL,
        ultimoDiaOperativo: '2026-11-25',
        config: {
            razonSocial: 'Hotel Montserrat S.A.S.',
            nit: '',
            direccion: '',
            telefono: '',
            regimen: 'Régimen Común / Ordinario'
        },
        huespedes: [
            { id: '1', nombre: 'Carlos Mendoza', documento: '10203040', habitacion: '101', plan: 3, comidasHoy: 2, estado: 'Activo' },
            { id: '2', nombre: 'Laura Restrepo', documento: '50607080', habitacion: '102', plan: 1, comidasHoy: 1, estado: 'Activo' },
            { id: '3', nombre: 'Andrés Cepeda', documento: '90102030', habitacion: '201', plan: 0, comidasHoy: 0, estado: 'Activo' },
            { id: '4', nombre: 'Mariana Pajón', documento: '11223344', habitacion: '204B', plan: 2, comidasHoy: 2, estado: 'Activo' }
        ],
        inventario: [
            { id: '1', nombre: 'Desayuno Andino Tradicional', categoria: 'Desayunos', stock: 15, stock_minimo: 5, precio: 18000, costo: 8000 },
            { id: '2', nombre: 'Almuerzo Ejecutivo del Día', categoria: 'Almuerzos', stock: 8, stock_minimo: 5, precio: 25000, costo: 12000 },
            { id: '3', nombre: 'Cena Ligera de la Casa', categoria: 'Cenas', stock: 4, stock_minimo: 5, precio: 22000, costo: 10000 },
            { id: '4', nombre: 'Jugo Natural en Agua', categoria: 'Bebidas', stock: 25, stock_minimo: 10, precio: 7000, costo: 2500 },
            { id: '5', nombre: 'Café de Origen Especial', categoria: 'Bebidas', stock: 3, stock_minimo: 5, precio: 5000, costo: 1500 },
            { id: '6', nombre: 'Postre Artesanal Montserrat', categoria: 'Postres', stock: 6, stock_minimo: 5, precio: 9000, costo: 4000 }
        ],
        comandas: [
            { id: 'c101', fecha: '2026-11-25', hora: '08:30', idHuesped: '2', cliente: 'Laura Restrepo', habitacion: '102', mesa: 'Mesa 4', plato: 'Desayuno Andino Tradicional', comida: 'Desayuno', cantidad: 1, valor: 0, tipo: 'Cortesía (Plan)', metodoPago: 'PLAN_HOTEL', mesero: 'Mesero de Turno' },
            { id: 'c102', fecha: '2026-11-25', hora: '12:45', idHuesped: '1', cliente: 'Carlos Mendoza', habitacion: '101', mesa: 'Mesa 1', plato: 'Almuerzo Ejecutivo del Día', comida: 'Almuerzo', cantidad: 1, valor: 0, tipo: 'Cortesía (Plan)', metodoPago: 'PLAN_HOTEL', mesero: 'Mesero de Turno' },
            { id: 'c103', fecha: '2026-11-25', hora: '13:15', idHuesped: null, cliente: 'Cliente Ocasional', habitacion: '', mesa: 'Mesa 8', plato: 'Almuerzo Ejecutivo del Día', comida: 'Almuerzo', cantidad: 2, valor: 50000, tipo: 'Cobro', metodoPago: 'EFECTIVO', mesero: 'Mesero de Turno' }
        ],
        cierresCaja: []
    };
}
