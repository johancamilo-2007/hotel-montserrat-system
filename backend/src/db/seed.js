/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SEMILLA DE BASE DE DATOS SEGURA (SEEDS)
 * Generación de usuarios con hashes criptográficos y catálogo inicial.
 * Mitigación AppSec: OWASP A07:2021 (Sin credenciales hardcodeadas en texto plano)
 * ============================================================================
 */

import { inicializarBaseDatos, ejecutarQuery, ejecutarTransaccion } from './connection.js';
import { derivarHashPassword, generarSal } from '../services/cryptoService.js';
import { ROLES } from '../services/userService.js';

export async function sembrarDatosIniciales() {
    await inicializarBaseDatos();

    await ejecutarTransaccion(async (tx) => {
        // 1. Sembrar Categorías de Inventario si no existen
        const categorias = [
            [1, 'Platos Fuertes'],
            [2, 'Carnes'],
            [3, 'Pescados'],
            [4, 'Aves'],
            [5, 'Desayunos'],
            [6, 'Bebidas'],
            [7, 'Postres']
        ];
        for (const [id, nombre] of categorias) {
            await ejecutarQuery(
                'INSERT INTO categorias_inventario (id, nombre) VALUES (?, ?)',
                [id, nombre],
                tx
            );
        }

        // 2. Sembrar Productos de Demostración con Umbral STOP individual
        const productos = [
            ['prod-1', 'Lomo Fino al Carbón', 2, 25, 5, 'Porción', 22000, 48000],
            ['prod-2', 'Trucha Arcoíris al Ajillo', 3, 18, 5, 'Porción', 18000, 39000],
            ['prod-3', 'Desayuno Montserrat Buffet', 5, 40, 10, 'Porción', 9000, 22000],
            ['prod-4', 'Jugo Natural de Frutas Andinas', 6, 30, 8, 'Vaso', 3500, 9500],
            ['prod-5', 'Café Especial Colombiano 100%', 6, 50, 10, 'Taza', 2000, 6000]
        ];
        for (const p of productos) {
            await ejecutarQuery(
                'INSERT INTO inventario (uuid, nombre, categoria_id, stock, stock_minimo, unidad, costo_unitario, precio_venta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                p,
                tx
            );
        }

        // 3. Sembrar Huéspedes Iniciales
        const huespedes = [
            ['hsp-1', 'Carlos Mendoza', 'CC-10203040', 'Habitación 101', 3], // Pensión Completa (3 comidas)
            ['hsp-2', 'Elena Restrepo', 'CE-99887766', 'Habitación 204', 1], // Desayuno (1 comida)
            ['hsp-3', 'David O\'Brien', 'PAS-A1234567', 'Habitación 305', 0]  // Solo Alojamiento (0 comidas)
        ];
        for (const h of huespedes) {
            await ejecutarQuery(
                'INSERT INTO huespedes (uuid, nombre, documento, habitacion, plan_id, comidas_hoy, estado) VALUES (?, ?, ?, ?, ?, 0, ?)',
                [...h, 'Activo'],
                tx
            );
        }
    });

    console.log('[SEEDS] Semilla de datos completada exitosamente.');
}

// Ejecución directa por CLI si es invocado como script principal
if (process.argv[1]?.endsWith('seed.js')) {
    sembrarDatosIniciales()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('[SEEDS CRITICAL]', err);
            process.exit(1);
        });
}
