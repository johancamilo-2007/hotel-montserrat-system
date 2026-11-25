/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - REPOSITORIO DE INVENTARIO (SISTEMA STOP)
 * Control de existencias, semáforo dinámico y descuento transaccional.
 * Mitigación AppSec: OWASP A03:2021 (SQL Injection) / Race Condition Prevention
 * ============================================================================
 */

import { ejecutarQuery } from '../db/connection.js';

export const InventarioRepository = {
    async buscarPorId(id, tx = null) {
        const filas = await ejecutarQuery(
            'SELECT * FROM inventario WHERE id = ?',
            [id],
            tx
        );
        return filas[0] || null;
    },

    async listar(tx = null) {
        return await ejecutarQuery('SELECT * FROM inventario', [], tx);
    },

    async crear({ uuid, nombre, categoria_id, stock, stock_minimo, unidad, costo_unitario, precio_venta }, tx = null) {
        const res = await ejecutarQuery(
            'INSERT INTO inventario (uuid, nombre, categoria_id, stock, stock_minimo, unidad, costo_unitario, precio_venta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid, nombre, categoria_id, stock, stock_minimo, unidad, costo_unitario, precio_venta],
            tx
        );
        return {
            id: res.insertId,
            uuid,
            nombre,
            categoria_id,
            stock,
            stock_minimo,
            unidad,
            costo_unitario,
            precio_venta
        };
    },

    /**
     * Descuenta existencias de forma atómica.
     * Si no hay existencias suficientes, lanza un error para forzar el ROLLBACK en la transacción.
     */
    async descontarStock(id, cantidad, tx = null) {
        const producto = await this.buscarPorId(id, tx);
        if (!producto) {
            throw new Error(`[INVENTARIO ERROR] El producto con ID ${id} no existe.`);
        }

        if (producto.stock < cantidad) {
            throw new Error(`[STOCK INSUFICIENTE] Producto "${producto.nombre}": existencias (${producto.stock}) inferiores a la cantidad solicitada (${cantidad}). Operación cancelada.`);
        }

        const res = await ejecutarQuery(
            'UPDATE inventario SET stock = stock - ? WHERE id = ?',
            [cantidad, id],
            tx
        );
        return res.affectedRows > 0;
    },

    async reponerStock(id, cantidad, tx = null) {
        const res = await ejecutarQuery(
            'UPDATE inventario SET stock = stock + ? WHERE id = ?',
            [cantidad, id],
            tx
        );
        return res.affectedRows > 0;
    }
};
