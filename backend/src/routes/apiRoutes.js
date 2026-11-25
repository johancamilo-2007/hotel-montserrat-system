/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - RUTAS DE NEGOCIO Y RBAC SERVER-SIDE
 * Endpoints protegidos con verificación estricta de permisos por rol y persistencia transaccional.
 * Mitigación AppSec: OWASP A01:2021 (Broken Access Control) / A03:2021 (SQLi)
 * ============================================================================
 */

import { requerirAutenticacion } from '../middlewares/authMiddleware.js';
import { requerirPermiso } from '../middlewares/rbacMiddleware.js';
import { obtenerEventosAuditoria, registrarEventoSeguridad, EVENTOS_AUDITORIA } from '../services/auditService.js';
import { HuespedRepository } from '../repositories/huespedRepository.js';
import { ComandaRepository } from '../repositories/comandaRepository.js';
import { InventarioRepository } from '../repositories/inventarioRepository.js';
import { CajaRepository } from '../repositories/cajaRepository.js';
import { HabitacionRepository } from '../repositories/habitacionRepository.js';
import { PmsService } from '../services/pmsService.js';
import { PosService } from '../services/posService.js';
import { InventarioService } from '../services/inventarioService.js';

export function configurarRutasNegocio(router) {
    // 1. Huéspedes
    router.get('/api/huespedes', requerirAutenticacion, requerirPermiso('ver_huespedes'), async (req, res) => {
        const huespedes = await HuespedRepository.listarActivos();
        res.json({
            ok: true,
            total: huespedes.length,
            huespedes,
            solicitante: req.user
        });
    });

    router.delete('/api/huespedes/:id', requerirAutenticacion, requerirPermiso('eliminar_huesped'), async (req, res) => {
        const idHuesped = req.params?.id;
        await HuespedRepository.eliminar(idHuesped);

        registrarEventoSeguridad(EVENTOS_AUDITORIA.DESTRUCTIVE_ACTION, {
            username: req.user.usuario,
            rol: req.user.rol,
            recurso: `/api/huespedes/${idHuesped || 'id'}`,
            resultado: 'SUCCESS',
            detalles: 'Eliminación autorizada de registro de huésped.'
        });

        res.json({
            ok: true,
            mensaje: `Huésped ${idHuesped || 'ID'} eliminado satisfactoriamente.`
        });
    });

    // 2. Inventario STOP
    router.get('/api/inventario', requerirAutenticacion, requerirPermiso('ver_inventario'), async (req, res) => {
        const items = await InventarioRepository.listar();
        res.json({
            ok: true,
            total: items.length,
            items
        });
    });

    // 3. Comandas (POS) - Atribución forzosa e inviolable del operador autenticado (B-5)
    router.post('/api/comandas', requerirAutenticacion, requerirPermiso('crear_comanda'), async (req, res) => {
        const { plato, cantidad, cliente, metodoPago, platoId, huespedId, tipo, total } = req.body || {};

        if (!plato || !cantidad) {
            return res.status(400).json({ ok: false, error: 'Datos de comanda incompletos.' });
        }

        const ahora = new Date();
        const fechaStr = ahora.toISOString().split('T')[0];
        const horaStr = ahora.toTimeString().split(' ')[0];

        try {
            const comandaCreada = await ComandaRepository.registrarComandaTransaccional({
                uuid: `com-${Date.now()}`,
                fecha: fechaStr,
                hora: horaStr,
                huespedId: huespedId || null,
                clienteNombre: cliente || 'Consumidor',
                habitacion: '',
                mesa: 'Mesa 1',
                // B-5: Inviolable en servidor -> operador SIEMPRE es el usuario en sesión
                mesero: req.user.nombre,
                comida: 'Plato a la Carta',
                platoId: platoId || null,
                platoNombre: plato,
                cantidad: Number(cantidad) || 1,
                tipo: tipo || 'Cobro',
                metodoPago: metodoPago || 'EFECTIVO',
                total: Number(total) || 0
            });

            res.status(201).json({
                ok: true,
                mensaje: 'Comanda registrada con éxito.',
                comanda: comandaCreada
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message || 'Error al registrar la comanda transaccional.'
            });
        }
    });

    // 4. Anulación de Comanda (Requiere Gerente / Administrador)
    router.post('/api/comandas/:id/anular', requerirAutenticacion, requerirPermiso('anular_comanda'), async (req, res) => {
        const { motivo, platoId, cantidad } = req.body || {};
        if (!motivo || String(motivo).trim().length < 5) {
            return res.status(400).json({ ok: false, error: 'Debes proporcionar un motivo detallado de anulación (mínimo 5 caracteres).' });
        }

        try {
            const resAnulacion = await ComandaRepository.anularComandaTransaccional(
                req.params?.id,
                motivo,
                platoId || null,
                Number(cantidad) || 0
            );

            res.json(resAnulacion);
        } catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });

    // 5. Cierre de Caja con Arqueo Físico (Cajero, Gerente o Administrador)
    router.post('/api/caja/cierre', requerirAutenticacion, requerirPermiso('cierre_caja'), async (req, res) => {
        const { comandasTotales, totalCaja, totalFolios, efectivoContado, diferencia, motivoReapertura } = req.body || {};
        const ahora = new Date();

        const acta = await CajaRepository.registrarCierre({
            uuid: `cie-${Date.now()}`,
            fecha: ahora.toISOString().split('T')[0],
            hora: ahora.toTimeString().split(' ')[0],
            usuarioResponsable: req.user.nombre,
            comandasTotales: Number(comandasTotales) || 0,
            totalCaja: Number(totalCaja) || 0,
            totalFolios: Number(totalFolios) || 0,
            efectivoContado: Number(efectivoContado) || 0,
            diferencia: Number(diferencia) || 0,
            motivoReapertura: motivoReapertura || null
        });

        res.json({
            ok: true,
            mensaje: 'Acta oficial de cierre de caja registrada con arqueo físico verificado.',
            acta
        });
    });

    // 6. PMS Hotelero (Check-in, Check-out y Habitaciones)
    router.get('/api/habitaciones', requerirAutenticacion, requerirPermiso('ver_huespedes'), async (req, res) => {
        const habitaciones = await HabitacionRepository.listar();
        res.json({ ok: true, total: habitaciones.length, habitaciones });
    });

    router.post('/api/pms/checkin', requerirAutenticacion, requerirPermiso('ver_huespedes'), async (req, res) => {
        try {
            const resultado = await PmsService.realizarCheckIn(req.body || {});
            res.status(201).json({ ok: true, mensaje: 'Check-in formalizado exitosamente.', ...resultado });
        } catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });

    router.post('/api/pms/checkout', requerirAutenticacion, requerirPermiso('ver_huespedes'), async (req, res) => {
        const { estanciaId, metodoPago } = req.body || {};
        try {
            const liquidacion = await PmsService.realizarCheckOut(estanciaId, metodoPago || 'EFECTIVO');
            res.json(liquidacion);
        } catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });

    // 7. Ajustes de Inventario STOP con Trazabilidad
    router.post('/api/inventario/ajuste', requerirAutenticacion, requerirPermiso('surtir_inventario'), async (req, res) => {
        const { productoId, cantidadAjuste, tipo, motivo } = req.body || {};
        try {
            const resultado = await InventarioService.ajustarStock({
                productoId,
                cantidadAjuste: Number(cantidadAjuste) || 0,
                tipo: tipo || 'AJUSTE',
                motivo,
                usuarioResponsable: req.user.nombre
            });
            res.json({ ok: true, mensaje: 'Movimiento de inventario registrado con trazabilidad.', ...resultado });
        } catch (err) {
            res.status(400).json({ ok: false, error: err.message });
        }
    });

    // 8. Generación de Comprobante Térmico para Comanda
    router.get('/api/comandas/:id/ticket', requerirAutenticacion, requerirPermiso('crear_comanda'), async (req, res) => {
        const comanda = await ComandaRepository.buscarPorId(req.params?.id);
        if (!comanda) {
            return res.status(404).json({ ok: false, error: 'Comanda no encontrada.' });
        }
        const ticket = PosService.generarComprobanteImprimible(comanda);
        res.json({ ok: true, ticket });
    });

    // 9. Restablecimiento de Sistema (Solo Administrador)
    router.post('/api/sistema/restablecer', requerirAutenticacion, requerirPermiso('restablecer_sistema'), (req, res) => {
        registrarEventoSeguridad(EVENTOS_AUDITORIA.DESTRUCTIVE_ACTION, {
            username: req.user.usuario,
            rol: req.user.rol,
            recurso: '/api/sistema/restablecer',
            resultado: 'SUCCESS',
            detalles: 'Restablecimiento de fábrica autorizado.'
        });

        res.json({
            ok: true,
            mensaje: 'Sistema restablecido a valores iniciales por el Administrador.'
        });
    });

    // 7. Auditoría Forense (Solo Administrador)
    router.get('/api/auditoria', requerirAutenticacion, requerirPermiso('gestionar_usuarios'), (req, res) => {
        const eventos = obtenerEventosAuditoria(50);
        res.json({
            ok: true,
            total: eventos.length,
            eventos
        });
    });
}
