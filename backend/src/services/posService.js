/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SERVICIO DE POS, FACTURACIÓN Y COMANDAS
 * Congelamiento de precios, partición de comandas multi-cantidad y folios.
 * Mitigación AppSec: OWASP A04:2021 (Insecure Design) / Trazabilidad Financiera
 * ============================================================================
 */

import { ejecutarTransaccion } from '../db/connection.js';
import { InventarioRepository } from '../repositories/inventarioRepository.js';
import { HuespedRepository } from '../repositories/huespedRepository.js';
import { EstanciaRepository } from '../repositories/estanciaRepository.js';
import { ComandaRepository } from '../repositories/comandaRepository.js';
import { repartirCortesias } from '../../../js/domain/planes.js';

let contadorConsecutivoGlobal = 1000;

export const PosService = {
    obtenerSiguienteConsecutivo() {
        return ++contadorConsecutivoGlobal;
    },

    /**
     * Registra una comanda con congelamiento estricto de precio y partición de cortesías.
     * Si la comanda es con cargo a habitación, acumula automáticamente el valor en el folio de la estancia.
     */
    async procesarComanda({
        platoId,
        cantidad = 1,
        huespedId = null,
        clienteNombre,
        habitacion = '',
        mesa = 'Mesa 1',
        mesero,
        comida = 'Plato a la Carta',
        metodoPago = 'EFECTIVO'
    }) {
        return await ejecutarTransaccion(async (tx) => {
            // 1. Obtener producto y congelar precio unitario actual
            const producto = await InventarioRepository.buscarPorId(platoId, tx);
            if (!producto) {
                throw new Error(`[POS ERROR] El producto con ID ${platoId} no existe en catálogo.`);
            }

            if (producto.stock < cantidad) {
                throw new Error(`[STOP CRÍTICO] Stock insuficiente para "${producto.nombre}". Existencias: ${producto.stock}, solicitadas: ${cantidad}.`);
            }

            const precioUnitarioCongelado = Number(producto.precio_venta) || 0;

            // 2. Determinar partición de cortesías si hay huésped con plan
            let cortesias = 0;
            let excedente = cantidad;
            let planInfo = null;
            let estanciaActiva = null;

            if (huespedId) {
                const huesped = await HuespedRepository.buscarPorId(huespedId, tx);
                estanciaActiva = await EstanciaRepository.buscarActivaPorHuesped(huespedId, tx);

                if (huesped && huesped.plan_id !== undefined) {
                    const particion = repartirCortesias({
                        plan: huesped.plan_id,
                        comidasHoy: huesped.comidas_hoy || 0,
                        cantidad
                    });
                    cortesias = particion.cortesias;
                    excedente = particion.excedente;
                }
            }

            const lineasCreadas = [];
            const ahora = new Date();
            const fechaStr = ahora.toISOString().split('T')[0];
            const horaStr = ahora.toTimeString().split(' ')[0];

            // 3. Registrar línea de cortesía (si aplica)
            if (cortesias > 0) {
                const consecutivoCortesía = this.obtenerSiguienteConsecutivo();
                const comandaCortesía = await ComandaRepository.registrarComandaTransaccional({
                    uuid: `com-cor-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    consecutivo: consecutivoCortesía,
                    fecha: fechaStr,
                    hora: horaStr,
                    huespedId,
                    clienteNombre,
                    habitacion,
                    mesa,
                    mesero,
                    comida,
                    platoId,
                    platoNombre: producto.nombre,
                    precioUnitario: precioUnitarioCongelado,
                    cantidad: cortesias,
                    tipo: 'Cortesía (Plan)',
                    metodoPago: 'PLAN_HOTEL',
                    total: 0
                });
                lineasCreadas.push(comandaCortesía);
            }

            // 4. Registrar línea de cobro/excedente (si aplica)
            if (excedente > 0) {
                const consecutivoCobro = this.obtenerSiguienteConsecutivo();
                const totalLinea = excedente * precioUnitarioCongelado;

                const comandaCobro = await ComandaRepository.registrarComandaTransaccional({
                    uuid: `com-cob-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    consecutivo: consecutivoCobro,
                    fecha: fechaStr,
                    hora: horaStr,
                    huespedId,
                    clienteNombre,
                    habitacion,
                    mesa,
                    mesero,
                    comida,
                    platoId,
                    platoNombre: producto.nombre,
                    precioUnitario: precioUnitarioCongelado,
                    cantidad: excedente,
                    tipo: 'Cobro',
                    metodoPago,
                    total: totalLinea
                });

                // Si es cargo a habitación y hay estancia activa, acumular en el folio
                if (metodoPago === 'CARGO_HABITACION' && estanciaActiva) {
                    await EstanciaRepository.acumularCargoFolio(estanciaActiva.id, totalLinea, tx);
                }

                lineasCreadas.push(comandaCobro);
            }

            return {
                ok: true,
                producto: producto.nombre,
                precioUnitarioCongelado,
                cantidadTotal: cantidad,
                cortesiasAplicadas: cortesias,
                excedenteCobrado: excedente,
                lineas: lineasCreadas
            };
        });
    },

    /**
     * Genera la representación del comprobante interno para impresión térmica.
     * VALIDAR CON CONTADOR/ABOGADO: Tratamiento de IVA vs Impoconsumo según régimen tributario colombiano.
     */
    generarComprobanteImprimible(comanda, datosHotel = {}) {
        const razonSocial = datosHotel.razonSocial || 'Hotel Montserrat S.A.S.';
        const nit = datosHotel.nit || 'NIT: 900.123.456-7 (VALIDAR CON CONTADOR)';
        const direccion = datosHotel.direccion || 'Carrera 7 # 12-45, Bogotá, Colombia';
        const telefono = datosHotel.telefono || '(601) 345-6789';

        const subtotal = comanda.total || 0;
        // NOTA FISCAL: En restaurantes bajo régimen común/ordinario aplica Impoconsumo 8% o IVA 19%
        const impuestoEstimado = Math.round(subtotal * 0.08); // 8% Impoconsumo estimado

        return {
            encabezado: {
                razonSocial,
                nit,
                direccion,
                telefono
            },
            comprobante: {
                consecutivo: comanda.consecutivo || comanda.id,
                fecha: comanda.fecha,
                hora: comanda.hora,
                cliente: comanda.cliente_nombre || comanda.clienteNombre,
                habitacion: comanda.habitacion,
                mesero: comanda.mesero,
                metodoPago: comanda.metodo_pago || comanda.metodoPago
            },
            items: [
                {
                    descripcion: comanda.plato_nombre || comanda.platoNombre,
                    cantidad: comanda.cantidad,
                    precioUnitario: comanda.precio_unitario || comanda.precioUnitario,
                    subtotal: comanda.total
                }
            ],
            totales: {
                subtotal,
                impuestoEstimado,
                total: subtotal
            },
            leyendaLegal: 'COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA',
            notaContable: 'VALIDAR CON CONTADOR/ABOGADO: Verificación de tarifas de IVA vs Impoconsumo según régimen fiscal del establecimiento.'
        };
    }
};
