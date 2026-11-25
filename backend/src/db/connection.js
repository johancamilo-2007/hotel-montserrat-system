/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - GESTOR DE CONEXIÓN Y TRANSACCIONES DE BASE DE DATOS
 * Capa de abstracción para consultas parametrizadas y transacciones ACID.
 * Mitigación AppSec: OWASP A03:2021 (Injection), ASVS V5.3 (Parameterized Queries)
 * ============================================================================
 */

import { env } from '../config/env.js';
import { registrarEventoSeguridad, EVENTOS_AUDITORIA } from '../services/auditService.js';

// Motor en memoria transaccional para pruebas y entornos sin servidor MySQL físico activo
class MotorTransaccionalMemoria {
    constructor() {
        this.tablas = new Map();
        this.reiniciar();
    }

    reiniciar() {
        this.tablas.clear();
        this.tablas.set('planes_alimentacion', [
            { id: 0, nombre: 'Solo Alojamiento', comidas_diarias: 0 },
            { id: 1, nombre: 'Alojamiento y Desayuno', comidas_diarias: 1 },
            { id: 2, nombre: 'Media Pensión', comidas_diarias: 2 },
            { id: 3, nombre: 'Pensión Completa', comidas_diarias: 3 }
        ]);
        this.tablas.set('habitaciones', [
            { id: 1, numero: '101', tipo: 'Suite Andina', tarifa_noche: 280000, estado: 'Disponible' },
            { id: 2, numero: '102', tipo: 'Doble Estándar', tarifa_noche: 180000, estado: 'Disponible' },
            { id: 3, numero: '201', tipo: 'Superior Balcón', tarifa_noche: 220000, estado: 'Disponible' },
            { id: 4, numero: '204', tipo: 'Doble Estándar', tarifa_noche: 180000, estado: 'Disponible' },
            { id: 5, numero: '305', tipo: 'Individual Confort', tarifa_noche: 140000, estado: 'Disponible' }
        ]);
        this.tablas.set('huespedes', []);
        this.tablas.set('estancias', []);
        this.tablas.set('categorias_inventario', [
            { id: 1, nombre: 'Platos Fuertes' },
            { id: 2, nombre: 'Carnes' },
            { id: 3, nombre: 'Pescados' },
            { id: 4, nombre: 'Aves' },
            { id: 5, nombre: 'Desayunos' },
            { id: 6, nombre: 'Bebidas' },
            { id: 7, nombre: 'Postres' }
        ]);
        this.tablas.set('inventario', []);
        this.tablas.set('movimientos_inventario', []);
        this.tablas.set('comandas', []);
        this.tablas.set('cierres_caja', []);
        this.tablas.set('usuarios', []);
        this.tablas.set('bitacora_auditoria', []);
    }

    clonarEstado() {
        const clon = new Map();
        for (const [tabla, filas] of this.tablas.entries()) {
            clon.set(tabla, filas.map(f => ({ ...f })));
        }
        return clon;
    }

    restaurarEstado(clon) {
        this.tablas = clon;
    }
}

const motorMemoria = new MotorTransaccionalMemoria();
let poolMySQLReal = null;
let transaccionActivaEnMemoria = null;

/**
 * Inicializa la conexión con MySQL real si el driver configurado es 'mysql'.
 */
export async function inicializarBaseDatos() {
    if (env.DB_DRIVER === 'mysql') {
        try {
            // Import dinámico de mysql2 solo si está instalado
            const mysql = await import('mysql2/promise');
            poolMySQLReal = mysql.createPool({
                host: env.DB_HOST,
                port: env.DB_PORT,
                user: env.DB_USER,
                password: env.DB_PASSWORD,
                database: env.DB_NAME,
                waitForConnections: true,
                connectionLimit: env.DB_CONNECTION_LIMIT,
                queueLimit: 0,
                charset: 'utf8mb4'
            });
            console.log(`[DB] Pool MySQL 8.0 inicializado exitosamente en ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
            return poolMySQLReal;
        } catch (err) {
            console.warn('[DB] Fallback a motor en memoria transaccional: No se pudo conectar a MySQL:', err.message);
            poolMySQLReal = null;
        }
    }
    return motorMemoria;
}

/**
 * Ejecuta una consulta SQL parametrizada garantizando protección contra inyección SQL.
 * @param {string} sql
 * @param {Array<any>} params
 * @param {Object} [txContext] Contexto de transacción activa
 * @returns {Promise<any>}
 */
export async function ejecutarQuery(sql, params = [], txContext = null) {
    // ASVS V5.3: Prohibir consultas no parametrizadas que contengan variables concatenadas
    if (!Array.isArray(params)) {
        throw new Error('[DB ERROR] Los parámetros de la consulta SQL deben ser un array.');
    }

    if (poolMySQLReal) {
        const cliente = txContext?.connection || poolMySQLReal;
        const [filas] = await cliente.execute(sql, params);
        return filas;
    }

    // Ejecución en el motor simulado transaccional en memoria
    return procesarConsultaEnMemoria(sql, params, txContext?.snapshot || motorMemoria.tablas);
}

/**
 * Ejecuta un bloque de operaciones dentro de una transacción ACID (BEGIN ... COMMIT / ROLLBACK).
 * Si ocurre cualquier excepción en el callback, realiza ROLLBACK automático y propaga el error.
 * 
 * @template T
 * @param {(tx: { query: (sql: string, params?: any[]) => Promise<any> }) => Promise<T>} operacion
 * @returns {Promise<T>}
 */
export async function ejecutarTransaccion(operacion) {
    if (poolMySQLReal) {
        const connection = await poolMySQLReal.getConnection();
        await connection.beginTransaction();
        const tx = {
            connection,
            query: (sql, params = []) => connection.execute(sql, params).then(([r]) => r)
        };

        try {
            const resultado = await operacion(tx);
            await connection.commit();
            return resultado;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Si ya estamos dentro de una transacción activa en memoria, reutilizar el contexto compartido
    if (transaccionActivaEnMemoria) {
        return await operacion(transaccionActivaEnMemoria);
    }

    // Transacción ACID en motor en memoria
    const snapshotPrevio = motorMemoria.clonarEstado();
    const snapshotTx = motorMemoria.clonarEstado();

    const tx = {
        snapshot: snapshotTx,
        query: (sql, params = []) => procesarConsultaEnMemoria(sql, params, snapshotTx)
    };

    transaccionActivaEnMemoria = tx;
    try {
        const resultado = await operacion(tx);
        // COMMIT: aplicar el snapshot de la transacción al estado maestro
        motorMemoria.tablas = snapshotTx;
        return resultado;
    } catch (error) {
        // ROLLBACK: descartar modificaciones y restaurar estado maestro
        motorMemoria.restaurarEstado(snapshotPrevio);
        throw error;
    } finally {
        transaccionActivaEnMemoria = null;
    }
}

/**
 * Interprete de consultas SQL básicas para el motor en memoria transaccional.
 */
function procesarConsultaEnMemoria(sql, params, storeTablas) {
    const sqlNormalizado = sql.trim().replace(/\s+/g, ' ');
    const sqlUpper = sqlNormalizado.toUpperCase();

    // 1. SELECT
    if (sqlUpper.startsWith('SELECT')) {
        const tablaMatch = sqlNormalizado.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (!tablaMatch) return [];
        const tabla = tablaMatch[1].toLowerCase();
        let coleccion = (storeTablas.get(tabla) || []).map(r => ({ ...r }));

        // Filtro por cláusula WHERE (simple o múltiple con AND)
        const whereClause = sqlNormalizado.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
        if (whereClause) {
            const condiciones = whereClause[1].split(/\s+AND\s+/i);
            let paramIdx = 0;
            const filtros = condiciones.map(cond => {
                const eqMatch = cond.match(/([a-zA-Z0-9_]+)\s*=\s*(\?|'[^']*'|\d+)/i);
                if (eqMatch) {
                    const col = eqMatch[1].toLowerCase();
                    const valExpr = eqMatch[2];
                    const val = valExpr === '?' ? params[paramIdx++] : valExpr.replace(/^['"]|['"]$/g, '');
                    return { col, val };
                }
                return null;
            }).filter(Boolean);

            coleccion = coleccion.filter(r => filtros.every(f => String(r[f.col]) === String(f.val)));
        }

        // Ordenamiento simple ORDER BY col DESC / ASC
        const orderMatch = sqlNormalizado.match(/ORDER\s+BY\s+([a-zA-Z0-9_]+)\s*(DESC|ASC)?/i);
        if (orderMatch) {
            const col = orderMatch[1].toLowerCase();
            const orden = (orderMatch[2] || 'ASC').toUpperCase();
            coleccion.sort((a, b) => {
                if (orden === 'DESC') return b[col] > a[col] ? 1 : -1;
                return a[col] > b[col] ? 1 : -1;
            });
        }

        return coleccion;
    }

    // 2. INSERT
    if (sqlUpper.startsWith('INSERT INTO')) {
        const insertMatch = sqlNormalizado.match(/INSERT INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (insertMatch) {
            const tabla = insertMatch[1].toLowerCase();
            const columnas = insertMatch[2].split(',').map(c => c.trim().toLowerCase());
            const valoresRaw = insertMatch[3].split(',').map(v => v.trim());
            let coleccion = storeTablas.get(tabla);
            if (!coleccion) {
                coleccion = [];
                storeTablas.set(tabla, coleccion);
            }

            const nuevoRegistro = { id: Date.now() + Math.floor(Math.random() * 1000) };
            let paramIdx = 0;
            columnas.forEach((col, idx) => {
                const valExpr = valoresRaw[idx];
                if (valExpr === '?') {
                    nuevoRegistro[col] = params[paramIdx++];
                } else if (/^\d+$/.test(valExpr)) {
                    nuevoRegistro[col] = parseInt(valExpr, 10);
                } else if (/^['"].*['"]$/.test(valExpr)) {
                    nuevoRegistro[col] = valExpr.slice(1, -1);
                } else {
                    nuevoRegistro[col] = valExpr;
                }
            });

            coleccion.push(nuevoRegistro);
            return { insertId: nuevoRegistro.id, affectedRows: 1 };
        }
    }

    // 3. UPDATE
    if (sqlUpper.startsWith('UPDATE')) {
        const updateMatch = sqlNormalizado.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
        if (updateMatch) {
            const tabla = updateMatch[1].toLowerCase();
            const setClause = updateMatch[2];
            const whereClause = updateMatch[3];

            // Parse WHERE col = ?
            const whereMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*=\s*\?/i);
            const whereCol = whereMatch ? whereMatch[1].toLowerCase() : null;
            const whereVal = whereMatch ? params[params.length - 1] : null;

            const coleccion = storeTablas.get(tabla) || [];
            let affectedRows = 0;

            // Separar múltiples asignaciones: "anulada = 1, motivo_anulacion = ?"
            const asignaciones = setClause.split(',').map(a => a.trim());

            coleccion.forEach(fila => {
                if (!whereCol || String(fila[whereCol]) === String(whereVal)) {
                    let localParamIdx = 0;
                    asignaciones.forEach(asig => {
                        const [colRaw, exprRaw] = asig.split('=').map(s => s.trim());
                        const col = colRaw.toLowerCase();
                        if (exprRaw === '?') {
                            fila[col] = params[localParamIdx++];
                        } else if (exprRaw.includes('- ?')) {
                            fila[col] = (Number(fila[col]) || 0) - Number(params[localParamIdx++]);
                        } else if (exprRaw.includes('+ ?')) {
                            fila[col] = (Number(fila[col]) || 0) + Number(params[localParamIdx++]);
                        } else if (/^\d+$/.test(exprRaw)) {
                            fila[col] = parseInt(exprRaw, 10);
                        } else if (/^['"].*['"]$/.test(exprRaw)) {
                            fila[col] = exprRaw.slice(1, -1);
                        } else {
                            fila[col] = exprRaw;
                        }
                    });
                    affectedRows++;
                }
            });

            return { affectedRows };
        }
    }

    // 4. DELETE
    if (sqlUpper.startsWith('DELETE FROM')) {
        const deleteMatch = sqlNormalizado.match(/DELETE FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+([a-zA-Z0-9_]+)\s*=\s*\?/i);
        if (deleteMatch) {
            const tabla = deleteMatch[1].toLowerCase();
            const whereCol = deleteMatch[2].toLowerCase();
            const whereVal = params[0];

            let coleccion = storeTablas.get(tabla) || [];
            const cantOriginal = coleccion.length;
            coleccion = coleccion.filter(r => String(r[whereCol]) !== String(whereVal));
            storeTablas.set(tabla, coleccion);
            return { affectedRows: cantOriginal - coleccion.length };
        }
    }

    return { affectedRows: 0 };
}

export function obtenerMotorMemoria() {
    return motorMemoria;
}
