/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - APP.JS (MÓDULO ES)
 * 
 * Controlador maestro de la aplicación web: gestión de estado, renderizado
 * reactivo en DOM con delegación de eventos, ciclo de vida de sesiones,
 * punto de venta (POS), inventario STOP y auditoría de caja.
 * 
 * Reglas de seguridad:
 * - OWASP A01:2021 (Broken Access Control) -> Verificación estricta de roles
 * - OWASP A03:2021 (Injection) -> Escape contextual y delegación de eventos
 * - OWASP A04:2021 (Insecure Design) -> Separación estricta de caja vs folios
 * ============================================================================
 */

import {
    campoVacio,
    soloLetras,
    soloNumeros,
    esDocumentoValido,
    esHabitacionValida,
    sanitizar,
    escapeHTML,
    escapeAttr,
    documentoExiste,
    formatoMoneda,
    formatoFechaHora,
    generarUUID
} from './validaciones.js';

import {
    ROLES,
    PERMISOS,
    obtenerUsuarioActual,
    estaAutenticado,
    puede,
    requierePermiso,
    validarLogin,
    reautenticar,
    cerrarSesion,
    migrarDatosLegacy,
    iniciarTimerInactividad
} from './seguridad.js';

import { fechaBogota, horaBogota, cambioDeDia } from './domain/fechas.js';
import { estadoStock, hayStockDisponible, ESTADO_STOCK } from './domain/inventario.js';
import { repartirCortesias } from './domain/planes.js';
import { clasificarPago, calcularResumenCaja, METODOS_PAGO } from './domain/caja.js';
import { validarBackup } from './domain/backup.js';
import { migrar, crearEstadoInicial, SCHEMA_VERSION_ACTUAL } from './domain/migraciones.js';

// Estado local reactivo de la aplicación (Bloque A: no toca window.baseDatos al importarse)
let estado = null;
let callbackReautenticacionPendiente = null;

export function getEstado() {
    return estado;
}

export function setEstado(nuevoEstado) {
    estado = nuevoEstado;
    if (typeof window !== 'undefined') {
        window.baseDatos = estado;
    }
}

/* ==========================================================================
   1. PERSISTENCIA DE DATOS Y MIGRACIÓN IDEMPOTENTE (LOCALSTORAGE)
   ========================================================================== */

export function guardarDatos() {
    if (!estado || typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem('hotelMontserrat_DB_v2', JSON.stringify(estado));
    } catch (e) {
        console.error('Error al guardar datos en localStorage:', e);
        mostrarToast('Error al persistir cambios en el navegador', 'error');
    }
}

export function cargarDatos() {
    if (typeof localStorage === 'undefined') {
        setEstado(crearEstadoInicial());
        return estado;
    }

    try {
        // Bloque B-2: Migrar llaves legacy si existen
        migrarDatosLegacy();

        const guardados = localStorage.getItem('hotelMontserrat_DB_v2');
        if (guardados) {
            const parsed = JSON.parse(guardados);
            const dbMigrada = migrar(parsed);
            const validacion = validarBackup(dbMigrada);

            if (validacion.ok && validacion.datosLimpios) {
                setEstado(validacion.datosLimpios);
            } else {
                console.warn('Datos en localStorage corruptos o inválidos:', validacion.errores);
                mostrarToast('Advertencia: Datos locales corruptos. Restaurando estado seguro.', 'warning');
                setEstado(crearEstadoInicial());
                guardarDatos();
            }
        } else {
            setEstado(crearEstadoInicial());
            guardarDatos();
        }
    } catch (e) {
        console.warn('Error al leer datos locales. Iniciando con base segura por defecto.', e);
        setEstado(crearEstadoInicial());
        guardarDatos();
    }

    return estado;
}

/* ==========================================================================
   2. REINICIO DIARIO A MEDIANOCHE (ZONA HORARIA COT - B6 / B7)
   ========================================================================== */

export function verificarCambioDeFecha() {
    if (!estado) return;
    const ahora = new Date();
    if (cambioDeDia(estado.ultimoDiaOperativo, ahora)) {
        const nuevoDia = fechaBogota(ahora);
        console.log(`[Hotel Montserrat] Cambio de jornada detectado: ${estado.ultimoDiaOperativo} -> ${nuevoDia}`);

        // Reinicia cupos de comidas servidas hoy SOLO para huéspedes con estancia ACTIVA
        estado.huespedes.forEach(h => {
            if (h.estado === 'Activo') {
                h.comidasHoy = 0;
            }
        });

        estado.ultimoDiaOperativo = nuevoDia;
        guardarDatos();

        if (typeof document !== 'undefined') {
            actualizarVistas();
            mostrarToast(`🌅 Nueva jornada operativa iniciada (${nuevoDia}). Cupos de alimentación reiniciados.`, 'info');
        }
    }
}

/* ==========================================================================
   3. NAVEGACIÓN Y CONTROL VISUAL (RBAC EN UI - B-4)
   ========================================================================== */

export function cambiarSeccion(seccionId) {
    if (typeof document === 'undefined') return;

    // Verificar permisos de lectura por sección
    const permisoSeccion = {
        dashboard: null,
        huespedes: 'ver_huespedes',
        comandas: 'crear_comanda',
        inventario: 'ver_inventario',
        caja: 'ver_caja',
        backup: 'exportar_backup'
    }[seccionId];

    if (permisoSeccion && !puede(permisoSeccion)) {
        mostrarToast(`Acceso denegado: Tu rol no tiene autorización para acceder a esta sección.`, 'error');
        return;
    }

    const sections = document.querySelectorAll('.view-section');
    sections.forEach(sec => sec.classList.remove('active'));

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));

    const targetSection = document.getElementById(`seccion-${seccionId}`);
    if (targetSection) targetSection.classList.add('active');

    const targetNav = document.getElementById(`nav-${seccionId}`);
    if (targetNav) targetNav.classList.add('active');

    const topTitle = document.getElementById('topbar-title');
    const titulos = {
        dashboard: 'Dashboard General',
        huespedes: 'Gestión y Derechos de Huéspedes',
        comandas: 'Punto de Venta (POS) & Comandas',
        inventario: 'Inventario Crítico (Sistema STOP)',
        caja: 'Flujo de Caja Diario & Facturación',
        backup: 'Mantenimiento & Copias de Seguridad'
    };

    if (topTitle) topTitle.textContent = titulos[seccionId] || 'Hotel Montserrat S.A.S.';
    actualizarVistas();
}

export function actualizarPerfilUsuario() {
    if (typeof document === 'undefined') return;
    const usuario = obtenerUsuarioActual();
    const avatarBadge = document.getElementById('user-avatar-badge');
    const displayName = document.getElementById('user-display-name');
    const roleBadge = document.getElementById('user-role-badge');
    const meseroInput = document.getElementById('comanda-mesero');

    if (usuario) {
        if (avatarBadge) avatarBadge.textContent = usuario.nombre.substring(0, 2).toUpperCase();
        if (displayName) displayName.textContent = usuario.nombre;
        if (roleBadge) roleBadge.textContent = usuario.rol;
        // B-5: Mesero de la comanda = usuario autenticado, solo lectura
        if (meseroInput) meseroInput.value = usuario.nombre;

        // Ocultar elementos de menú según RBAC (Bloque B-4)
        ocultarElementoPorPermiso('nav-huespedes', 'ver_huespedes');
        ocultarElementoPorPermiso('nav-comandas', 'crear_comanda');
        ocultarElementoPorPermiso('nav-inventario', 'ver_inventario');
        ocultarElementoPorPermiso('nav-caja', 'ver_caja');
        ocultarElementoPorPermiso('nav-backup', 'exportar_backup');

        ocultarElementoPorPermiso('btn-config-institucional', 'restablecer_sistema');
        ocultarElementoPorPermiso('btn-corte-topbar', 'cierre_caja');
        ocultarElementoPorPermiso('btn-quick-cierre', 'cierre_caja');
        ocultarElementoPorPermiso('btn-quick-prod', 'crear_producto');
        ocultarElementoPorPermiso('btn-reiniciar-comidas', 'reiniciar_comidas');
        ocultarElementoPorPermiso('btn-nuevo-producto-top', 'crear_producto');
        ocultarElementoPorPermiso('btn-cierre-caja-section', 'cierre_caja');
        ocultarElementoPorPermiso('btn-importar-backup', 'importar_backup');
        ocultarElementoPorPermiso('btn-restablecer-sistema', 'restablecer_sistema');
    }
}

function ocultarElementoPorPermiso(elementId, accion) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (puede(accion)) {
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

export function mostrarToast(mensaje, tipo = 'success') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensaje;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* ==========================================================================
   4. RENDERIZADO REACTIVO DE VISTAS (DOM SEGURO SIN INNERHTML PELIGROSO)
   ========================================================================== */

export function actualizarVistas() {
    if (!estado || typeof document === 'undefined') return;
    renderizarDashboard();
    renderizarHuespedes();
    renderizarSelectHuespedesComanda();
    renderizarSelectPlatosComanda();
    renderizarComandas();
    renderizarInventario();
    renderizarCaja();
    renderizarHistorialCierres();
    verificarAlertasSTOP();
}

function renderizarDashboard() {
    const hoyStr = fechaBogota();
    const activos = estado.huespedes.filter(h => h.estado === 'Activo');
    const comandasHoy = estado.comandas.filter(c => c.fecha === hoyStr && !c.anulada);

    const resumenCaja = calcularResumenCaja(comandasHoy);

    // Contadores
    const dashHuespedes = document.getElementById('dash-huespedes-total');
    const dashComidas = document.getElementById('dash-huespedes-comidas');
    const dashComandas = document.getElementById('dash-comandas-total');
    const dashComandasSub = document.getElementById('dash-comandas-subtext');
    const dashVentas = document.getElementById('dash-ventas-total');
    const dashVentasSub = document.getElementById('dash-ventas-subtext');
    const dashAlertas = document.getElementById('dash-alertas-total');

    const totalComidasServidas = activos.reduce((acc, h) => acc + (Number(h.comidasHoy) || 0), 0);
    const criticos = estado.inventario.filter(i => estadoStock(i) === ESTADO_STOCK.CRITICO);

    if (dashHuespedes) dashHuespedes.textContent = activos.length;
    if (dashComidas) dashComidas.textContent = `${totalComidasServidas} comidas servidas hoy`;
    if (dashComandas) dashComandas.textContent = comandasHoy.length;
    if (dashComandasSub) dashComandasSub.textContent = `${comandasHoy.filter(c => c.tipo === 'Cobro').length} cobros | ${resumenCaja.cortesias} cortesías de plan`;
    if (dashVentas) dashVentas.textContent = formatoMoneda(resumenCaja.totalCaja);
    if (dashVentasSub) dashVentasSub.textContent = `Folios por cobrar: ${formatoMoneda(resumenCaja.cuentasPorCobrar)}`;
    if (dashAlertas) dashAlertas.textContent = criticos.length;

    // Tabla rápida en dashboard
    const tbody = document.getElementById('tabla-dash-comandas');
    if (!tbody) return;

    if (comandasHoy.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:18px;">No hay comandas registradas hoy (${hoyStr})</td></tr>`;
        return;
    }

    const ultimas = comandasHoy.slice(-6).reverse();
    tbody.innerHTML = ultimas.map(c => `
        <tr>
            <td><strong style="color:var(--gold);">#${escapeHTML(String(c.id).slice(0, 8))}</strong></td>
            <td>${escapeHTML(c.hora || '12:00')}</td>
            <td>${escapeHTML(c.cliente)} ${c.habitacion ? `(Hab. ${escapeHTML(c.habitacion)})` : ''}</td>
            <td>${c.cantidad}x ${escapeHTML(c.plato)}</td>
            <td><span class="badge ${c.tipo === 'Cobro' ? 'badge-success' : 'badge-warning'}">${escapeHTML(c.tipo)}</span></td>
            <td><code>${escapeHTML(c.metodoPago)}</code></td>
            <td style="font-weight:bold;">${formatoMoneda(c.valor)}</td>
            <td>
                <button class="btn btn-secondary btn-sm" data-action="ver-ticket" data-id="${escapeAttr(c.id)}" title="Ver Comprobante">🧾</button>
            </td>
        </tr>
    `).join('');
}

function renderizarHuespedes() {
    const tbody = document.getElementById('tabla-huespedes');
    const contador = document.getElementById('contador-huespedes');
    const filtro = document.getElementById('filtro-huespedes')?.value?.toLowerCase() || '';
    if (!tbody) return;

    let filtrados = estado.huespedes;
    if (filtro) {
        filtrados = filtrados.filter(h =>
            h.nombre.toLowerCase().includes(filtro) ||
            h.documento.toLowerCase().includes(filtro) ||
            h.habitacion.toLowerCase().includes(filtro)
        );
    }

    if (contador) contador.textContent = filtrados.length;

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No se encontraron huéspedes registrados</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(h => {
        const puedeComer = h.comidasHoy < h.plan;
        const badgeColor = puedeComer ? 'badge-success' : 'badge-danger';
        const planNombres = ['Solo Alojamiento (0)', 'Alojamiento y Desayuno (1)', 'Media Pensión (2)', 'Pensión Completa (3)'];

        return `
            <tr>
                <td><strong>${escapeHTML(h.nombre)}</strong></td>
                <td><code>${escapeHTML(h.documento)}</code></td>
                <td><span class="badge badge-info">${escapeHTML(h.habitacion)}</span></td>
                <td>${planNombres[h.plan] || `${h.plan} Comidas`}</td>
                <td>
                    <span class="badge ${badgeColor}">${h.comidasHoy} de ${h.plan} servidas</span>
                </td>
                <td>
                    <span class="badge ${h.estado === 'Activo' ? 'badge-success' : 'badge-secondary'}">
                        ${escapeHTML(h.estado)}
                    </span>
                </td>
                <td style="display:flex; gap:6px;">
                    ${h.estado === 'Activo' ? `
                        <button class="btn btn-sm" data-action="consumo-express" data-id="${escapeAttr(h.id)}" title="Servir Comida Express">
                            🍽️ Servir
                        </button>
                        <button class="btn btn-secondary btn-sm" data-action="toggle-checkout" data-id="${escapeAttr(h.id)}" title="Check-out">
                            Check-out
                        </button>
                    ` : `
                        <button class="btn btn-secondary btn-sm" data-action="toggle-checkin" data-id="${escapeAttr(h.id)}" title="Reingresar estancia">
                            Reingresar
                        </button>
                    `}
                    <button class="btn btn-danger btn-sm" data-action="eliminar-huesped" data-id="${escapeAttr(h.id)}" title="Eliminar registro">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderizarSelectHuespedesComanda() {
    const select = document.getElementById('comanda-huesped');
    if (!select) return;

    const activos = estado.huespedes.filter(h => h.estado === 'Activo');
    if (activos.length === 0) {
        select.innerHTML = '<option value="">No hay huéspedes activos en el hotel</option>';
        return;
    }

    select.innerHTML = activos.map(h => {
        const cupoRestante = Math.max(0, h.plan - h.comidasHoy);
        return `<option value="${escapeAttr(h.id)}">${escapeHTML(h.nombre)} (Hab. ${escapeHTML(h.habitacion)}) - Cupo hoy: ${cupoRestante}/${h.plan}</option>`;
    }).join('');

    actualizarInfoHuespedSeleccionado();
}

export function actualizarInfoHuespedSeleccionado() {
    const select = document.getElementById('comanda-huesped');
    const info = document.getElementById('comanda-huesped-info');
    if (!select || !info) return;

    const huesped = estado.huespedes.find(h => String(h.id) === String(select.value));
    if (!huesped) {
        info.textContent = '';
        return;
    }

    const restantes = Math.max(0, huesped.plan - huesped.comidasHoy);
    info.textContent = `Huésped con Plan ${huesped.plan} comidas. Ha consumido ${huesped.comidasHoy}. Cupo disponible hoy: ${restantes} plato(s).`;
}

function renderizarSelectPlatosComanda() {
    const select = document.getElementById('comanda-plato');
    if (!select) return;

    const disponibles = estado.inventario.filter(i => i.stock > 0);
    if (disponibles.length === 0) {
        select.innerHTML = '<option value="">⚠️ Sin existencias en inventario (Sistema STOP)</option>';
        return;
    }

    select.innerHTML = disponibles.map(i => `
        <option value="${escapeAttr(i.id)}" data-precio="${i.precio}">
            ${escapeHTML(i.nombre)} - ${formatoMoneda(i.precio)} (Stock: ${i.stock})
        </option>
    `).join('');

    actualizarPrecioComanda();
}

export function actualizarPrecioComanda() {
    const tipo = document.getElementById('comanda-tipo')?.value || 'huesped';
    const platoSelect = document.getElementById('comanda-plato');
    const cantInput = document.getElementById('comanda-cantidad');
    const preview = document.getElementById('comanda-total-preview');
    if (!platoSelect || !cantInput || !preview) return;

    const platoOption = platoSelect.selectedOptions[0];
    const precio = Number(platoOption?.dataset?.precio) || 0;
    const cantidad = Math.max(1, parseInt(cantInput.value, 10) || 1);

    if (tipo === 'huesped') {
        const huespedId = document.getElementById('comanda-huesped')?.value;
        const huesped = estado.huespedes.find(h => String(h.id) === String(huespedId));
        if (huesped) {
            const { cortesias, excedente } = repartirCortesias({
                plan: huesped.plan,
                comidasHoy: huesped.comidasHoy,
                cantidad
            });
            const cobroExcedente = excedente * precio;
            preview.textContent = `${formatoMoneda(cobroExcedente)} (${cortesias} cortesía, ${excedente} cobro)`;
            return;
        }
    }

    preview.textContent = formatoMoneda(precio * cantidad);
}

function renderizarComandas() {
    const tbody = document.getElementById('tabla-comandas');
    const contador = document.getElementById('contador-comandas');
    const filtro = document.getElementById('filtro-comandas')?.value?.toLowerCase() || '';
    if (!tbody) return;

    const hoyStr = fechaBogota();
    let filtradas = estado.comandas.filter(c => c.fecha === hoyStr);

    if (filtro) {
        filtradas = filtradas.filter(c =>
            c.cliente.toLowerCase().includes(filtro) ||
            c.plato.toLowerCase().includes(filtro) ||
            (c.mesero && c.mesero.toLowerCase().includes(filtro))
        );
    }

    if (contador) contador.textContent = filtradas.length;

    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">No se registran comandas en el sistema hoy (${hoyStr})</td></tr>`;
        return;
    }

    tbody.innerHTML = filtradas.slice().reverse().map(c => `
        <tr style="${c.anulada ? 'opacity:0.5; text-decoration:line-through;' : ''}">
            <td><strong>${escapeHTML(c.hora || '12:00')}</strong></td>
            <td>${escapeHTML(c.mesa || 'Salón')} ${c.habitacion ? `(Hab. ${escapeHTML(c.habitacion)})` : ''}</td>
            <td>${escapeHTML(c.cliente)}</td>
            <td>${c.cantidad}x ${escapeHTML(c.plato)}</td>
            <td>${escapeHTML(c.comida || 'Almuerzo')}</td>
            <td>
                <span class="badge ${c.anulada ? 'badge-secondary' : c.tipo === 'Cobro' ? 'badge-success' : 'badge-warning'}">
                    ${c.anulada ? 'ANULADA' : escapeHTML(c.tipo)}
                </span>
            </td>
            <td><code>${escapeHTML(c.metodoPago)}</code></td>
            <td style="font-weight:bold;">${formatoMoneda(c.valor)}</td>
            <td><small>${escapeHTML(c.mesero || 'Sistema')}</small></td>
            <td style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-sm" data-action="ver-ticket" data-id="${escapeAttr(c.id)}" title="Ver Comprobante">🧾</button>
                ${!c.anulada ? `
                    <button class="btn btn-danger btn-sm" data-action="abrir-anular-comanda" data-id="${escapeAttr(c.id)}" title="Anular Comanda">❌</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function renderizarInventario() {
    const tbody = document.getElementById('tabla-inventario');
    const filtro = document.getElementById('filtro-inventario')?.value?.toLowerCase() || '';
    if (!tbody) return;

    let filtrados = estado.inventario;
    if (filtro) {
        filtrados = filtrados.filter(i =>
            i.nombre.toLowerCase().includes(filtro) ||
            i.categoria.toLowerCase().includes(filtro)
        );
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:20px;">No se encontraron artículos en inventario</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(i => {
        const estadoCod = estadoStock(i);
        let badgeHtml = '<span class="badge badge-success">● Óptimo</span>';
        if (estadoCod === ESTADO_STOCK.CRITICO) {
            badgeHtml = '<span class="badge badge-danger">🛑 CRÍTICO (STOP)</span>';
        } else if (estadoCod === ESTADO_STOCK.BAJO) {
            badgeHtml = '<span class="badge badge-warning">⚠️ Stock Bajo</span>';
        }

        return `
            <tr>
                <td>${badgeHtml}</td>
                <td><strong>${escapeHTML(i.nombre)}</strong></td>
                <td>${escapeHTML(i.categoria)}</td>
                <td style="font-weight:bold; font-size:1.05rem;">${i.stock}</td>
                <td><small style="color:var(--text-muted);">Mín: ${i.stock_minimo}</small></td>
                <td>${formatoMoneda(i.costo)}</td>
                <td style="font-weight:bold; color:var(--gold);">${formatoMoneda(i.precio)}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" data-action="abrir-surtir" data-id="${escapeAttr(i.id)}" title="Surtir Producto">
                        ➕ Surtir
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderizarCaja() {
    const tbody = document.getElementById('tabla-caja');
    const cajaTotal = document.getElementById('caja-total');
    const cajaFolios = document.getElementById('caja-folios');
    const cajaEfectivo = document.getElementById('caja-efectivo');
    const cajaElectronico = document.getElementById('caja-electronico');
    if (!tbody) return;

    const hoyStr = fechaBogota();
    const comandasHoy = estado.comandas.filter(c => c.fecha === hoyStr && !c.anulada);

    const resumen = calcularResumenCaja(comandasHoy);

    if (cajaTotal) cajaTotal.textContent = formatoMoneda(resumen.totalCaja);
    if (cajaFolios) cajaFolios.textContent = formatoMoneda(resumen.cuentasPorCobrar);
    if (cajaEfectivo) cajaEfectivo.textContent = formatoMoneda(resumen.efectivo);
    if (cajaElectronico) cajaElectronico.textContent = formatoMoneda(resumen.digital);

    if (comandasHoy.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No hay movimientos de caja registrados hoy</td></tr>`;
        return;
    }

    tbody.innerHTML = comandasHoy.slice().reverse().map(c => `
        <tr>
            <td>${escapeHTML(c.hora || '12:00')}</td>
            <td>${escapeHTML(c.cliente)} - ${c.cantidad}x ${escapeHTML(c.plato)}</td>
            <td><code>${escapeHTML(c.metodoPago)}</code></td>
            <td><span class="badge ${c.tipo === 'Cobro' ? 'badge-success' : 'badge-warning'}">${escapeHTML(c.tipo)}</span></td>
            <td style="font-weight:bold; color:${c.metodoPago === METODOS_PAGO.CARGO_HABITACION ? 'var(--warning)' : 'var(--success)'};">
                ${formatoMoneda(c.valor)}
            </td>
        </tr>
    `).join('');
}

function renderizarHistorialCierres() {
    const tbody = document.getElementById('tabla-cierres-historial');
    if (!tbody) return;

    const cierres = estado.cierresCaja || [];
    if (cierres.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:16px;">No se registran actas oficiales de cierre en el historial</td></tr>`;
        return;
    }

    tbody.innerHTML = cierres.slice().reverse().map(cc => {
        const dif = Number(cc.diferencia) || 0;
        let difHtml = '<span class="badge badge-success">Cuadrada ($0)</span>';
        if (dif > 0) difHtml = `<span class="badge badge-warning">Sobrante +${formatoMoneda(dif)}</span>`;
        else if (dif < 0) difHtml = `<span class="badge badge-danger">Faltante ${formatoMoneda(dif)}</span>`;

        return `
            <tr>
                <td><strong>${escapeHTML(cc.fecha)}</strong></td>
                <td>${escapeHTML(cc.hora)}</td>
                <td>${escapeHTML(cc.usuario)}</td>
                <td>${cc.comandasCount}</td>
                <td style="font-weight:bold; color:var(--success);">${formatoMoneda(cc.totalCaja)}</td>
                <td style="color:var(--warning);">${formatoMoneda(cc.totalFolios)}</td>
                <td>${formatoMoneda(cc.efectivoContado)}</td>
                <td>${difHtml}</td>
                <td><small>${cc.motivoReapertura ? `Reapertura: ${escapeHTML(cc.motivoReapertura)}` : 'Oficial'}</small></td>
            </tr>
        `;
    }).join('');
}

function verificarAlertasSTOP() {
    const banner = document.getElementById('alerta-stop');
    const mensaje = document.getElementById('alerta-stop-mensaje');
    if (!banner || !mensaje) return;

    const criticos = estado.inventario.filter(i => estadoStock(i) === ESTADO_STOCK.CRITICO);
    if (criticos.length > 0) {
        banner.style.display = 'block';
        const nombres = criticos.map(i => `${escapeHTML(i.nombre)} (${i.stock} de mín. ${i.stock_minimo})`).join(', ');
        mensaje.textContent = `Atención: Insumos críticos sin existencias seguras: ${nombres}. Por favor reabastecer de inmediato.`;
    } else {
        banner.style.display = 'none';
    }
}

/* ==========================================================================
   5. OPERACIONES DE NEGOCIO (COMMANDS & HANDLERS)
   ========================================================================== */

export function registrarHuesped() {
    requierePermiso('ver_huespedes');

    const nombreInput = document.getElementById('huesped-nombre');
    const docInput = document.getElementById('huesped-doc');
    const habInput = document.getElementById('huesped-hab');
    const planSelect = document.getElementById('huesped-plan');

    const nombre = sanitizar(nombreInput?.value);
    const doc = sanitizar(docInput?.value);
    const hab = sanitizar(habInput?.value);
    const plan = parseInt(planSelect?.value, 10);

    if (campoVacio(nombre) || !soloLetras(nombre)) {
        mostrarToast('Nombre inválido. Ingresa solo letras y tildes.', 'error');
        return;
    }
    if (campoVacio(doc) || !esDocumentoValido(doc)) {
        mostrarToast('Documento inválido. Debe tener entre 4 y 20 caracteres alfanuméricos.', 'error');
        return;
    }
    if (campoVacio(hab) || !esHabitacionValida(hab)) {
        mostrarToast('Habitación inválida. Ejemplos: 101, 204B, Suite 1.', 'error');
        return;
    }

    // B8: Permite reingreso si el registro anterior está en Check-out
    if (documentoExiste(doc, estado.huespedes)) {
        mostrarToast(`El huésped con documento ${doc} ya tiene una estancia ACTIVA en el hotel.`, 'error');
        return;
    }

    const nuevoHuesped = {
        id: generarUUID(),
        nombre,
        documento: doc,
        habitacion: hab,
        plan: isNaN(plan) ? 0 : plan,
        comidasHoy: 0,
        estado: 'Activo'
    };

    estado.huespedes.push(nuevoHuesped);
    guardarDatos();
    actualizarVistas();

    if (nombreInput) nombreInput.value = '';
    if (docInput) docInput.value = '';
    if (habInput) habInput.value = '';
    mostrarToast(`Huésped ${nombre} registrado con éxito en habitación ${hab}`);
}

export function registrarComanda() {
    requierePermiso('crear_comanda');

    const tipoCliente = document.getElementById('comanda-tipo')?.value || 'huesped';
    const platoSelect = document.getElementById('comanda-plato');
    const cantidadInput = document.getElementById('comanda-cantidad');
    const comidaSelect = document.getElementById('comanda-comida');
    const mesaSelect = document.getElementById('comanda-mesa');
    const pagoSelect = document.getElementById('comanda-pago');
    const usuarioActual = obtenerUsuarioActual();

    const platoId = platoSelect?.value;
    const producto = estado.inventario.find(i => String(i.id) === String(platoId));
    if (!producto) {
        mostrarToast('Selecciona un plato válido con existencias.', 'error');
        return;
    }

    const cantidad = Math.max(1, parseInt(cantidadInput?.value, 10) || 1);
    if (!hayStockDisponible(producto, cantidad)) {
        mostrarToast(`Stock insuficiente. Solo quedan ${producto.stock} unidades de ${producto.nombre}.`, 'error');
        return;
    }

    const momento = comidaSelect?.value || 'Almuerzo';
    const mesa = mesaSelect?.value || 'Salón';
    const horaActual = horaBogota();
    const hoyStr = fechaBogota();
    const meseroNombre = usuarioActual ? usuarioActual.nombre : 'Operador';

    if (tipoCliente === 'huesped') {
        const huespedId = document.getElementById('comanda-huesped')?.value;
        const huesped = estado.huespedes.find(h => String(h.id) === String(huespedId));
        if (!huesped) {
            mostrarToast('Selecciona un huésped activo.', 'error');
            return;
        }

        // B3: Partición de cortesías y excedente
        const { cortesias, excedente } = repartirCortesias({
            plan: huesped.plan,
            comidasHoy: huesped.comidasHoy,
            cantidad
        });

        // 1. Registrar comanda de cortesía (si aplica)
        if (cortesias > 0) {
            const comandaCortesia = {
                id: generarUUID(),
                fecha: hoyStr,
                hora: horaActual,
                idHuesped: String(huesped.id),
                cliente: huesped.nombre,
                habitacion: huesped.habitacion,
                mesa,
                plato: producto.nombre,
                comida: momento,
                cantidad: cortesias,
                valor: 0,
                tipo: 'Cortesía (Plan)',
                metodoPago: METODOS_PAGO.PLAN_HOTEL,
                mesero: meseroNombre,
                anulada: false,
                motivoAnulacion: null
            };
            estado.comandas.push(comandaCortesia);
            huesped.comidasHoy += cortesias;
        }

        // 2. Registrar comanda de excedente (si aplica)
        if (excedente > 0) {
            const valorExcedente = excedente * producto.precio;
            const comandaExcedente = {
                id: generarUUID(),
                fecha: hoyStr,
                hora: horaActual,
                idHuesped: String(huesped.id),
                cliente: huesped.nombre,
                habitacion: huesped.habitacion,
                mesa,
                plato: producto.nombre,
                comida: momento,
                cantidad: excedente,
                valor: valorExcedente,
                tipo: 'Cobro',
                metodoPago: METODOS_PAGO.CARGO_HABITACION,
                mesero: meseroNombre,
                anulada: false,
                motivoAnulacion: null
            };
            estado.comandas.push(comandaExcedente);
        }

        producto.stock -= cantidad;
        guardarDatos();
        actualizarVistas();
        mostrarToast(`Comanda registrada: ${cortesias} cortesía(s) y ${excedente} con cargo a habitación.`);
    } else {
        // Cliente Externo
        const clienteInput = document.getElementById('comanda-externo');
        const clienteNombre = sanitizar(clienteInput?.value) || 'Cliente Externo / Consumidor';
        const metodoPago = clasificarPago(pagoSelect?.value);
        const total = cantidad * producto.precio;

        const nuevaComanda = {
            id: generarUUID(),
            fecha: hoyStr,
            hora: horaActual,
            idHuesped: null,
            cliente: clienteNombre,
            habitacion: '',
            mesa,
            plato: producto.nombre,
            comida: momento,
            cantidad,
            valor: total,
            tipo: 'Cobro',
            metodoPago,
            mesero: meseroNombre,
            anulada: false,
            motivoAnulacion: null
        };

        estado.comandas.push(nuevaComanda);
        producto.stock -= cantidad;
        guardarDatos();
        actualizarVistas();

        if (clienteInput) clienteInput.value = '';
        mostrarToast(`Comanda externa registrada exitosamente por ${formatoMoneda(total)}.`);
    }
}

/* ==========================================================================
   6. CONSUMO EXPRESS ASISTIDO MEDIANTE MODAL (Bloque D-2)
   ========================================================================== */

export function abrirModalConsumoExpress(huespedId) {
    requierePermiso('crear_comanda');

    const huesped = estado.huespedes.find(h => String(h.id) === String(huespedId));
    if (!huesped) {
        mostrarToast('Huésped no encontrado', 'error');
        return;
    }

    const detalleP = document.getElementById('express-huesped-detalle');
    const idInput = document.getElementById('express-huesped-id');
    const platoSelect = document.getElementById('express-plato');
    const cantInput = document.getElementById('express-cantidad');

    const restantes = Math.max(0, huesped.plan - huesped.comidasHoy);
    if (detalleP) {
        detalleP.textContent = `${huesped.nombre} | Habitación: ${huesped.habitacion} | Cupo hoy: ${restantes} de ${huesped.plan}`;
    }
    if (idInput) idInput.value = huesped.id;
    if (cantInput) cantInput.value = 1;

    // Solo platos con existencia
    const disponibles = estado.inventario.filter(i => i.stock > 0);
    if (disponibles.length === 0) {
        mostrarToast('No hay productos con stock disponible en el restaurante.', 'error');
        return;
    }

    if (platoSelect) {
        platoSelect.innerHTML = disponibles.map(i => `
            <option value="${escapeAttr(i.id)}">${escapeHTML(i.nombre)} (Stock: ${i.stock}) - ${formatoMoneda(i.precio)}</option>
        `).join('');
    }

    abrirModal('modal-consumo-express');
}

export function confirmarConsumoExpress() {
    requierePermiso('crear_comanda');

    const idInput = document.getElementById('express-huesped-id');
    const momentoSelect = document.getElementById('express-momento');
    const platoSelect = document.getElementById('express-plato');
    const cantInput = document.getElementById('express-cantidad');

    const huesped = estado.huespedes.find(h => String(h.id) === String(idInput?.value));
    const producto = estado.inventario.find(i => String(i.id) === String(platoSelect?.value));
    const cantidad = Math.max(1, parseInt(cantInput?.value, 10) || 1);
    const momento = momentoSelect?.value || 'Almuerzo';

    if (!huesped || !producto) {
        mostrarToast('Error en datos de huésped o plato seleccionado.', 'error');
        return;
    }

    if (!hayStockDisponible(producto, cantidad)) {
        mostrarToast(`Stock insuficiente. Solo quedan ${producto.stock} unidades.`, 'error');
        return;
    }

    const hoyStr = fechaBogota();
    const horaActual = horaBogota();
    const usuarioActual = obtenerUsuarioActual();
    const meseroNombre = usuarioActual ? usuarioActual.nombre : 'Operador';

    const { cortesias, excedente } = repartirCortesias({
        plan: huesped.plan,
        comidasHoy: huesped.comidasHoy,
        cantidad
    });

    if (cortesias > 0) {
        estado.comandas.push({
            id: generarUUID(),
            fecha: hoyStr,
            hora: horaActual,
            idHuesped: String(huesped.id),
            cliente: huesped.nombre,
            habitacion: huesped.habitacion,
            mesa: 'Express',
            plato: producto.nombre,
            comida: momento,
            cantidad: cortesias,
            valor: 0,
            tipo: 'Cortesía (Plan)',
            metodoPago: METODOS_PAGO.PLAN_HOTEL,
            mesero: meseroNombre,
            anulada: false,
            motivoAnulacion: null
        });
        huesped.comidasHoy += cortesias;
    }

    if (excedente > 0) {
        estado.comandas.push({
            id: generarUUID(),
            fecha: hoyStr,
            hora: horaActual,
            idHuesped: String(huesped.id),
            cliente: huesped.nombre,
            habitacion: huesped.habitacion,
            mesa: 'Express',
            plato: producto.nombre,
            comida: momento,
            cantidad: excedente,
            valor: excedente * producto.precio,
            tipo: 'Cobro',
            metodoPago: METODOS_PAGO.CARGO_HABITACION,
            mesero: meseroNombre,
            anulada: false,
            motivoAnulacion: null
        });
    }

    producto.stock -= cantidad;
    guardarDatos();
    actualizarVistas();
    cerrarModal('modal-consumo-express');
    mostrarToast(`Consumo express servido: ${cortesias} cortesía(s) y ${excedente} cargo(s) a habitación.`);
}

/* ==========================================================================
   7. ANULACIÓN DE COMANDA CON MOTIVO OBLIGATORIO (Bloque D-5)
   ========================================================================== */

export function abrirModalAnularComanda(comandaId) {
    requierePermiso('anular_comanda');

    const comanda = estado.comandas.find(c => String(c.id) === String(comandaId));
    if (!comanda) return;

    const pDetalle = document.getElementById('anular-comanda-detalle');
    const idInput = document.getElementById('anular-comanda-id');
    const motivoTextarea = document.getElementById('anular-motivo');

    if (pDetalle) {
        pDetalle.textContent = `Comanda #${comanda.id.slice(0, 8)} | ${comanda.cantidad}x ${comanda.plato} | Cliente: ${comanda.cliente} | Monto: ${formatoMoneda(comanda.valor)}`;
    }
    if (idInput) idInput.value = comanda.id;
    if (motivoTextarea) motivoTextarea.value = '';

    abrirModal('modal-anular-comanda');
}

export function confirmarAnulacionComanda() {
    requierePermiso('anular_comanda');

    const idInput = document.getElementById('anular-comanda-id');
    const motivoTextarea = document.getElementById('anular-motivo');
    const motivo = sanitizar(motivoTextarea?.value);

    if (campoVacio(motivo) || motivo.length < 5) {
        mostrarToast('Debes ingresar un motivo de anulación detallado (mínimo 5 caracteres).', 'error');
        return;
    }

    const comanda = estado.comandas.find(c => String(c.id) === String(idInput?.value));
    if (!comanda) return;

    comanda.anulada = true;
    comanda.motivoAnulacion = motivo;

    // Revertir inventario
    const producto = estado.inventario.find(i => i.nombre === comanda.plato);
    if (producto) {
        producto.stock += comanda.cantidad;
    }

    // Revertir cupo de cortesía si fue de plan
    if (comanda.tipo === 'Cortesía (Plan)' && comanda.idHuesped) {
        const huesped = estado.huespedes.find(h => String(h.id) === String(comanda.idHuesped));
        if (huesped) {
            huesped.comidasHoy = Math.max(0, huesped.comidasHoy - comanda.cantidad);
        }
    }

    guardarDatos();
    actualizarVistas();
    cerrarModal('modal-anular-comanda');
    mostrarToast(`Comanda #${comanda.id.slice(0, 8)} anulada con éxito. Stock y cupos revertidos.`);
}

/* ==========================================================================
   8. CIERRE DE CAJA DIARIO CON ARQUEO FÍSICO (Bloque D-3)
   ========================================================================== */

export function abrirModalCierreCaja() {
    requierePermiso('cierre_caja');

    const hoyStr = fechaBogota();
    const comandasHoy = estado.comandas.filter(c => c.fecha === hoyStr && !c.anulada);
    const resumen = calcularResumenCaja(comandasHoy);
    const usuario = obtenerUsuarioActual() || { nombre: 'Operador' };

    // Verificar si ya existe un cierre en el día de hoy
    const cierrePrevio = (estado.cierresCaja || []).find(c => c.fecha === hoyStr);
    const esReapertura = Boolean(cierrePrevio);

    if (esReapertura && usuario.rol !== ROLES.ADMINISTRADOR) {
        mostrarToast(`Ya existe un cierre oficial para hoy (${hoyStr}). Solo un Administrador puede generar un recierre.`, 'error');
        return;
    }

    const body = document.getElementById('cierre-body-content');
    if (!body) return;

    body.innerHTML = `
        <div style="background:var(--bg-secondary); border-radius:var(--radius); padding:16px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Fecha Operativa (COT):</span>
                <strong>${hoyStr}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Responsable de Turno:</span>
                <strong>${escapeHTML(usuario.nombre)} (${escapeHTML(usuario.rol)})</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Comandas del Día:</span>
                <strong>${comandasHoy.length} órdenes</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Cortesías de Plan Servidas:</span>
                <strong>${resumen.cortesias} platos</strong>
            </div>
            <hr style="border:0; border-top:1px solid var(--border); margin:10px 0;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Efectivo Físico Esperado:</span>
                <strong id="cierre-efectivo-esperado" data-valor="${resumen.efectivo}">${formatoMoneda(resumen.efectivo)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span>Pagos Digitales (Tarjetas/Transf):</span>
                <strong>${formatoMoneda(resumen.digital)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:1.1rem; color:var(--success); font-weight:bold; margin-top:6px;">
                <span>TOTAL RECAUDADO EN CAJA:</span>
                <span>${formatoMoneda(resumen.totalCaja)}</span>
            </div>
            <hr style="border:0; border-top:1px dashed var(--border); margin:10px 0;">
            <div style="display:flex; justify-content:space-between; color:var(--warning); font-size:0.92rem;">
                <span>Cargos a Habitación (Folios por cobrar):</span>
                <strong>${formatoMoneda(resumen.cuentasPorCobrar)}</strong>
            </div>
        </div>

        <!-- Arqueo de Caja Físico -->
        <div class="form-group">
            <label for="cierre-efectivo-contado"><strong>Efectivo Físico Contado en Caja ($) *</strong></label>
            <input type="number" id="cierre-efectivo-contado" min="0" value="${resumen.efectivo}" style="font-size:1.1rem; font-weight:bold;">
            <div id="cierre-diferencia-box" style="margin-top:6px; font-weight:600; font-size:0.88rem;"></div>
        </div>

        ${esReapertura ? `
            <div class="form-group" style="background:rgba(255,180,0,0.08); border:1px solid var(--warning); padding:10px; border-radius:var(--radius-sm);">
                <label for="cierre-motivo-reapertura" style="color:var(--warning); font-weight:bold;">
                    ⚠️ Advertencia: Ya existe un cierre hoy. Motivo obligatorio de recierre:
                </label>
                <input type="text" id="cierre-motivo-reapertura" placeholder="Ej. Registro tardío de comanda de cena">
            </div>
        ` : ''}
    `;

    // Listener para arqueo dinámico
    const inputContado = document.getElementById('cierre-efectivo-contado');
    const difBox = document.getElementById('cierre-diferencia-box');
    const recalcularArqueo = () => {
        const esperado = resumen.efectivo;
        const contado = Number(inputContado?.value) || 0;
        const dif = contado - esperado;

        if (dif === 0) {
            difBox.innerHTML = '<span style="color:var(--success)">✅ Caja cuadrada exactamente (Diferencia: $ 0)</span>';
        } else if (dif > 0) {
            difBox.innerHTML = `<span style="color:var(--warning)">⚠️ Sobrante en arqueo: +${formatoMoneda(dif)}</span>`;
        } else {
            difBox.innerHTML = `<span style="color:var(--danger)">❌ Faltante en arqueo: -${formatoMoneda(Math.abs(dif))}</span>`;
        }
    };

    if (inputContado) {
        inputContado.addEventListener('input', recalcularArqueo);
        recalcularArqueo();
    }

    abrirModal('modal-cierre');
}

export function confirmarCierreCaja() {
    requierePermiso('cierre_caja');

    const hoyStr = fechaBogota();
    const comandasHoy = estado.comandas.filter(c => c.fecha === hoyStr && !c.anulada);
    const resumen = calcularResumenCaja(comandasHoy);
    const usuario = obtenerUsuarioActual() || { nombre: 'Operador' };

    const cierrePrevio = (estado.cierresCaja || []).find(c => c.fecha === hoyStr);
    let motivoReapertura = null;

    if (cierrePrevio) {
        const inputMotivo = document.getElementById('cierre-motivo-reapertura');
        motivoReapertura = sanitizar(inputMotivo?.value);
        if (campoVacio(motivoReapertura) || motivoReapertura.length < 5) {
            mostrarToast('Ingresa el motivo obligatorio para registrar un segundo cierre en el mismo día.', 'error');
            return;
        }
    }

    const inputContado = document.getElementById('cierre-efectivo-contado');
    const contado = Number(inputContado?.value) || 0;
    const diferencia = contado - resumen.efectivo;

    const nuevoCierre = {
        id: generarUUID(),
        fecha: hoyStr,
        hora: horaBogota(),
        usuario: usuario.nombre,
        comandasCount: comandasHoy.length,
        totalCaja: resumen.totalCaja,
        totalFolios: resumen.cuentasPorCobrar,
        efectivoContado: contado,
        diferencia,
        motivoReapertura
    };

    if (!Array.isArray(estado.cierresCaja)) {
        estado.cierresCaja = [];
    }

    estado.cierresCaja.push(nuevoCierre);
    guardarDatos();
    actualizarVistas();
    cerrarModal('modal-cierre');
    mostrarToast('Acta oficial de cierre de caja registrada correctamente en el historial.', 'success');
}

/* ==========================================================================
   9. TICKET / COMPROBANTE DE COMANDAS (Bloque D-4)
   ========================================================================== */

export function verTicket(comandaId) {
    const comanda = estado.comandas.find(c => String(c.id) === String(comandaId));
    if (!comanda) return;

    const contenedor = document.getElementById('ticket-imprimible');
    if (!contenedor) return;

    const config = estado.config || {};
    const nitTexto = config.nit ? `NIT: ${escapeHTML(config.nit)}` : 'NIT NO CONFIGURADO';
    const direccionTexto = config.direccion ? escapeHTML(config.direccion) : 'Dirección: No configurada';
    const telTexto = config.telefono ? `Tel: ${escapeHTML(config.telefono)}` : '';

    contenedor.innerHTML = `
        <div class="receipt-header">
            <h4>${escapeHTML(config.razonSocial || 'HOTEL MONTSERRAT S.A.S.')}</h4>
            <p style="margin:0; font-size:0.78rem;">${nitTexto} | ${escapeHTML(config.regimen || 'Régimen Común')}</p>
            <p style="margin:2px 0 0 0; font-size:0.76rem;">${direccionTexto}</p>
            <p style="margin:2px 0 0 0; font-size:0.76rem;">${telTexto}</p>
            <div style="background:#000; color:#fff; font-size:0.7rem; font-weight:bold; padding:3px 0; margin:6px 0; letter-spacing:0.5px;">
                COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA
            </div>
        </div>

        <div class="receipt-line">
            <span>Comanda:</span>
            <strong>#${escapeHTML(String(comanda.id).slice(0, 8))}</strong>
        </div>
        <div class="receipt-line">
            <span>Fecha y Hora (COT):</span>
            <span>${escapeHTML(comanda.fecha || fechaBogota())} ${escapeHTML(comanda.hora || '12:00')}</span>
        </div>
        <div class="receipt-line">
            <span>Operador / Mesero:</span>
            <span>${escapeHTML(comanda.mesero || 'Sistema')}</span>
        </div>
        <div class="receipt-line">
            <span>Ubicación:</span>
            <span>${escapeHTML(comanda.mesa || 'Salón')} ${comanda.habitacion ? `(Hab. ${escapeHTML(comanda.habitacion)})` : ''}</span>
        </div>
        <div class="receipt-line">
            <span>Cliente:</span>
            <strong>${escapeHTML(comanda.cliente)}</strong>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-line" style="font-weight:bold;">
            <span>DESCRIPCIÓN</span>
            <span>IMPORTE</span>
        </div>
        <div class="receipt-line">
            <span>${comanda.cantidad}x ${escapeHTML(comanda.plato)}</span>
            <span>${formatoMoneda(comanda.valor)}</span>
        </div>
        <div class="receipt-line" style="font-size:0.78rem; color:#666;">
            <span>Momento: ${escapeHTML(comanda.comida || 'Almuerzo')}</span>
            <span>${escapeHTML(comanda.tipo)}</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-line">
            <span>Subtotal:</span>
            <span>${formatoMoneda(comanda.valor)}</span>
        </div>
        <div class="receipt-line">
            <span>IVA / Impoconsumo:</span>
            <span>$ 0 (VALIDAR CON CONTADOR/ABOGADO)</span>
        </div>
        <div class="receipt-total">
            <span>TOTAL:</span>
            <span>${formatoMoneda(comanda.valor)}</span>
        </div>
        <div class="receipt-line" style="margin-top:4px;">
            <span>Método de Pago:</span>
            <strong>${escapeHTML(comanda.metodoPago)}</strong>
        </div>

        <div class="receipt-footer">
            <p style="margin:0 0 4px 0;">¡Gracias por su visita al Restaurante Montserrat!</p>
            <p style="margin:0;">Sistema Integral de Gestión Hotelera & Restaurante</p>
        </div>
    `;

    abrirModal('modal-ticket');
}

/* ==========================================================================
   10. SURTIR Y GESTIÓN DE PRODUCTOS
   ========================================================================== */

export function abrirModalSurtir(itemId) {
    requierePermiso('surtir_inventario');

    const item = estado.inventario.find(i => String(i.id) === String(itemId));
    if (!item) return;

    const pInfo = document.getElementById('surtir-producto-info');
    const idInput = document.getElementById('surtir-producto-id');
    const cantInput = document.getElementById('surtir-cantidad');

    if (pInfo) pInfo.textContent = `Surtir: ${item.nombre} (Stock actual: ${item.stock} | Mínimo: ${item.stock_minimo})`;
    if (idInput) idInput.value = item.id;
    if (cantInput) cantInput.value = 10;

    abrirModal('modal-surtir');
}

export function confirmarSurtir() {
    requierePermiso('surtir_inventario');

    const idInput = document.getElementById('surtir-producto-id');
    const cantInput = document.getElementById('surtir-cantidad');

    const item = estado.inventario.find(i => String(i.id) === String(idInput?.value));
    const cantidad = parseInt(cantInput?.value, 10);

    if (!item || isNaN(cantidad) || cantidad <= 0) {
        mostrarToast('Cantidad de reabastecimiento inválida.', 'error');
        return;
    }

    item.stock += cantidad;
    guardarDatos();
    actualizarVistas();
    cerrarModal('modal-surtir');
    mostrarToast(`Se han añadido +${cantidad} unidades a ${item.nombre}. Stock total: ${item.stock}`);
}

export function guardarNuevoProducto() {
    requierePermiso('crear_producto');

    const nombreInput = document.getElementById('prod-nombre');
    const catSelect = document.getElementById('prod-categoria');
    const stockMinInput = document.getElementById('prod-stock-min');
    const stockInput = document.getElementById('prod-stock');
    const costoInput = document.getElementById('prod-costo');
    const precioInput = document.getElementById('prod-precio');

    const nombre = sanitizar(nombreInput?.value);
    const categoria = catSelect?.value || 'Platos Fuertes';
    const stockMin = parseInt(stockMinInput?.value, 10) || 5;
    const stock = parseInt(stockInput?.value, 10) || 0;
    const costo = Number(costoInput?.value) || 0;
    const precio = Number(precioInput?.value) || 0;

    if (campoVacio(nombre)) {
        mostrarToast('El nombre del producto no puede estar vacío.', 'error');
        return;
    }
    if (precio <= 0) {
        mostrarToast('El precio de venta debe ser superior a cero.', 'error');
        return;
    }

    const nuevoItem = {
        id: generarUUID(),
        nombre,
        categoria,
        stock: Math.max(0, stock),
        stock_minimo: Math.max(1, stockMin),
        costo: Math.max(0, costo),
        precio
    };

    estado.inventario.push(nuevoItem);
    guardarDatos();
    actualizarVistas();
    cerrarModal('modal-nuevo-producto');

    if (nombreInput) nombreInput.value = '';
    mostrarToast(`Producto ${nombre} añadido al inventario con éxito.`);
}

/* ==========================================================================
   11. BACKUPS, CSV Y REAUTENTICACIÓN ACCESIBLE (Bloque B-6 / C-3 / C-5 / C-6)
   ========================================================================== */

export function exportarCajaCSV() {
    requierePermiso('exportar_backup');

    const hoyStr = fechaBogota();
    const comandasHoy = estado.comandas.filter(c => c.fecha === hoyStr);

    let csv = 'ID,Fecha,Hora,Cliente,Habitacion,Plato,Cantidad,Momento,Tipo,MetodoPago,Valor,Operador\n';

    comandasHoy.forEach(c => {
        // Bloque C-6: Neutralización estricta de fórmulas para Excel/Calc
        const sanitizarCSV = (val) => {
            const str = String(val ?? '').replace(/"/g, '""').trim();
            if (/^[=+\-@\t\r]/.test(str)) {
                return `"'${str}"`;
            }
            return `"${str}"`;
        };

        const cantidad = Number(c.cantidad) || 1;
        const valor = Number(c.valor) || 0;

        csv += [
            sanitizarCSV(c.id),
            sanitizarCSV(c.fecha),
            sanitizarCSV(c.hora),
            sanitizarCSV(c.cliente),
            sanitizarCSV(c.habitacion || 'N/A'),
            sanitizarCSV(c.plato),
            cantidad,
            sanitizarCSV(c.comida || 'Almuerzo'),
            sanitizarCSV(c.tipo),
            sanitizarCSV(c.metodoPago),
            valor,
            sanitizarCSV(c.mesero || 'Sistema')
        ].join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Caja_HotelMontserrat_${hoyStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Reporte CSV descargado con protección anti-fórmulas.');
}

export function exportarBaseDatosJSON() {
    requierePermiso('exportar_backup');

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(estado, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `Backup_HotelMontserrat_${fechaBogota()}.json`;
    a.click();
    mostrarToast('Copia de seguridad JSON descargada correctamente.');
}

export function importarBaseDatosJSON(event) {
    requierePermiso('importar_backup');

    const file = event.target?.files?.[0];
    if (!file) return;

    // Bloque C-5: Descargar backup de resguardo automático antes de importar
    exportarBaseDatosJSON();
    mostrarToast('Resguardo automático previo descargado.', 'info');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const rawData = JSON.parse(e.target.result);
            const validacion = validarBackup(rawData, file.size);

            if (!validacion.ok) {
                mostrarToast(`Importación rechazada: ${validacion.errores[0]}`, 'error');
                console.error('Errores de validación de backup:', validacion.errores);
                return;
            }

            setEstado(validacion.datosLimpios);
            guardarDatos();
            actualizarVistas();
            mostrarToast('Copia de seguridad importada con éxito (Validación Todo-o-Nada aprobada).');
        } catch (err) {
            mostrarToast('Error al parsear el archivo JSON. Formato inválido.', 'error');
        }
    };

    reader.readAsText(file);
    event.target.value = '';
}

export function solicitarReautenticacion(titulo, mensaje, onAutorizado) {
    callbackReautenticacionPendiente = onAutorizado;
    const tEl = document.getElementById('reauth-titulo');
    const mEl = document.getElementById('reauth-mensaje');
    const pInput = document.getElementById('reauth-password');
    const errDiv = document.getElementById('reauth-error');

    if (tEl) tEl.textContent = titulo;
    if (mEl) mEl.textContent = mensaje;
    if (pInput) {
        pInput.value = '';
        setTimeout(() => pInput.focus(), 150);
    }
    if (errDiv) errDiv.style.display = 'none';

    abrirModal('modal-reautenticacion');
}

export async function confirmarReautenticacion() {
    const pInput = document.getElementById('reauth-password');
    const errDiv = document.getElementById('reauth-error');
    const password = pInput?.value || '';

    const esValido = await reautenticar(password);
    if (esValido) {
        cerrarModal('modal-reautenticacion');
        if (typeof callbackReautenticacionPendiente === 'function') {
            callbackReautenticacionPendiente();
            callbackReautenticacionPendiente = null;
        }
    } else {
        if (errDiv) {
            errDiv.textContent = '❌ Contraseña incorrecta. Acción no autorizada.';
            errDiv.style.display = 'block';
        }
        if (pInput) {
            pInput.value = '';
            pInput.focus();
        }
    }
}

export function restablecerDatosFabrica() {
    requierePermiso('restablecer_sistema');

    solicitarReautenticacion(
        '⚠️ Restablecimiento de Fábrica',
        'Esta acción ELIMINARÁ todos los registros actuales y restaurará los datos por defecto. Ingresa tu contraseña de Administrador para confirmar:',
        () => {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('hotelMontserrat_DB_v2');
                localStorage.removeItem('hotelAndino_DB_v2');
                localStorage.removeItem('hotelAndino_DB');
            }
            setEstado(crearEstadoInicial());
            guardarDatos();
            actualizarVistas();
            mostrarToast('Sistema restablecido exitosamente a sus valores de fábrica.');
        }
    );
}

export function eliminarHuespedSeguro(idHuesped) {
    requierePermiso('eliminar_huesped');

    const huesped = estado.huespedes.find(h => String(h.id) === String(idHuesped));
    if (!huesped) return;

    solicitarReautenticacion(
        'Eliminar Registro de Huésped',
        `¿Confirmas la eliminación definitiva del registro de "${huesped.nombre}" (Hab. ${huesped.habitacion})? Esta acción requiere autorización:`,
        () => {
            estado.huespedes = estado.huespedes.filter(h => String(h.id) !== String(idHuesped));
            guardarDatos();
            actualizarVistas();
            mostrarToast(`Registro de huésped ${huesped.nombre} eliminado.`);
        }
    );
}

export function reiniciarComidasHoyModal() {
    requierePermiso('reiniciar_comidas');

    estado.huespedes.forEach(h => {
        if (h.estado === 'Activo') h.comidasHoy = 0;
    });
    guardarDatos();
    actualizarVistas();
    mostrarToast('Consumo de comidas diarias de huéspedes activos reiniciado a 0.');
}

export function guardarConfiguracionInstitucional() {
    requierePermiso('restablecer_sistema');

    const razonInput = document.getElementById('config-razon-social');
    const nitInput = document.getElementById('config-nit');
    const dirInput = document.getElementById('config-direccion');
    const telInput = document.getElementById('config-telefono');

    if (!estado.config) estado.config = {};
    estado.config.razonSocial = sanitizar(razonInput?.value) || 'Hotel Montserrat S.A.S.';
    estado.config.nit = sanitizar(nitInput?.value);
    estado.config.direccion = sanitizar(dirInput?.value);
    estado.config.telefono = sanitizar(telInput?.value);

    guardarDatos();
    cerrarModal('modal-configuracion');
    mostrarToast('Configuración institucional actualizada.');
}

/* ==========================================================================
   12. DELEGACIÓN CENTRALIZADA DE EVENTOS EN EL DOM (Bloque C-1)
   ========================================================================== */

export function manejarClickDelegado(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;
    const modalId = target.dataset.modal;
    const seccion = target.dataset.seccion;

    switch (action) {
        case 'login':
            ejecutarLogin();
            break;
        case 'toggle-pw':
            togglePassword();
            break;
        case 'logout':
            cerrarSesion();
            location.reload();
            break;
        case 'navegar':
            if (seccion) cambiarSeccion(seccion);
            break;
        case 'abrir-modal':
            if (modalId) abrirModal(modalId);
            break;
        case 'cerrar-modal':
            if (modalId) cerrarModal(modalId);
            break;
        case 'abrir-cierre-caja':
            abrirModalCierreCaja();
            break;
        case 'confirmar-cierre-caja':
            confirmarCierreCaja();
            break;
        case 'guardar-huesped':
            registrarHuesped();
            break;
        case 'eliminar-huesped':
            if (id) eliminarHuespedSeguro(id);
            break;
        case 'toggle-checkout':
            if (id) {
                const h = estado.huespedes.find(x => String(x.id) === String(id));
                if (h) {
                    h.estado = 'Check-out';
                    guardarDatos();
                    actualizarVistas();
                    mostrarToast(`Check-out realizado para ${h.nombre}.`);
                }
            }
            break;
        case 'toggle-checkin':
            if (id) {
                const h = estado.huespedes.find(x => String(x.id) === String(id));
                if (h) {
                    h.estado = 'Activo';
                    h.comidasHoy = 0;
                    guardarDatos();
                    actualizarVistas();
                    mostrarToast(`Reingreso registrado para ${h.nombre}.`);
                }
            }
            break;
        case 'consumo-express':
            if (id) abrirModalConsumoExpress(id);
            break;
        case 'confirmar-consumo-express':
            confirmarConsumoExpress();
            break;
        case 'registrar-comanda':
            registrarComanda();
            break;
        case 'ver-ticket':
            if (id) verTicket(id);
            break;
        case 'abrir-anular-comanda':
            if (id) abrirModalAnularComanda(id);
            break;
        case 'confirmar-anulacion-comanda':
            confirmarAnulacionComanda();
            break;
        case 'abrir-surtir':
            if (id) abrirModalSurtir(id);
            break;
        case 'confirmar-surtir':
            confirmarSurtir();
            break;
        case 'guardar-nuevo-producto':
            guardarNuevoProducto();
            break;
        case 'exportar-csv':
            exportarCajaCSV();
            break;
        case 'exportar-backup':
            exportarBaseDatosJSON();
            break;
        case 'disparar-importar-backup':
            document.getElementById('input-archivo-backup')?.click();
            break;
        case 'restablecer-sistema':
            restablecerDatosFabrica();
            break;
        case 'reiniciar-comidas':
            reiniciarComidasHoyModal();
            break;
        case 'confirmar-reautenticacion':
            confirmarReautenticacion();
            break;
        case 'guardar-configuracion':
            guardarConfiguracionInstitucional();
            break;
        case 'imprimir-ticket':
            window.print();
            break;
    }
}

export async function ejecutarLogin() {
    const usuarioInput = document.getElementById('login-usuario');
    const claveInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');
    const btnLogin = document.getElementById('btn-login');

    const usuario = usuarioInput?.value || '';
    const clave = claveInput?.value || '';

    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.textContent = 'Verificando con PBKDF2...';
    }

    try {
        const resultado = await validarLogin(usuario, clave);
        if (resultado.ok) {
            if (errorDiv) errorDiv.style.display = 'none';
            const overlay = document.getElementById('login-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    document.getElementById('app-sidebar').style.display = 'flex';
                    document.getElementById('app-main').style.display = 'flex';
                    actualizarPerfilUsuario();
                    actualizarVistas();
                    mostrarToast(`👋 Bienvenido al sistema, ${resultado.usuario.nombre}`);
                }, 300);
            }
        } else {
            if (errorDiv) {
                errorDiv.textContent = resultado.mensaje;
                errorDiv.style.display = 'block';
            }
            if (claveInput) {
                claveInput.value = '';
                claveInput.focus();
            }
        }
    } catch (e) {
        console.error('Error durante autenticación:', e);
        if (errorDiv) {
            errorDiv.textContent = 'Error interno durante el procesamiento de credenciales.';
            errorDiv.style.display = 'block';
        }
    } finally {
        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Ingresar al Sistema';
        }
    }
}

export function togglePassword() {
    const input = document.getElementById('login-password');
    const btn = document.getElementById('btn-toggle-pw');
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈 Ocultar';
    } else {
        input.type = 'password';
        btn.textContent = '👁️ Ver';
    }
}

export function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

export function cerrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

/* ==========================================================================
   13. INICIALIZADOR PRINCIPAL (iniciarApp)
   ========================================================================== */

export function iniciarApp() {
    cargarDatos();

    if (typeof document === 'undefined') return;

    // Configurar reloj en vivo COT
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        const updateClock = () => {
            clockEl.textContent = `COT ${horaBogota()} | ${fechaBogota()}`;
        };
        updateClock();
        setInterval(updateClock, 30000);
    }

    // Listener global delegado para clicks
    document.addEventListener('click', manejarClickDelegado);

    // Listener para Enter en login
    const pwInput = document.getElementById('login-password');
    if (pwInput) {
        pwInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') ejecutarLogin();
        });
    }

    // Listeners de búsqueda y cambio de inputs
    document.getElementById('filtro-huespedes')?.addEventListener('input', renderizarHuespedes);
    document.getElementById('filtro-comandas')?.addEventListener('input', renderizarComandas);
    document.getElementById('filtro-inventario')?.addEventListener('input', renderizarInventario);

    document.getElementById('comanda-tipo')?.addEventListener('change', (e) => {
        const esHuesped = e.target.value === 'huesped';
        const gH = document.getElementById('grupo-huesped');
        const gE = document.getElementById('grupo-externo');
        const gP = document.getElementById('grupo-metodo-pago');
        if (gH) gH.style.display = esHuesped ? 'block' : 'none';
        if (gE) gE.style.display = esHuesped ? 'none' : 'block';
        if (gP) gP.style.display = esHuesped ? 'none' : 'block';
        actualizarPrecioComanda();
    });

    document.getElementById('comanda-huesped')?.addEventListener('change', () => {
        actualizarInfoHuespedSeleccionado();
        actualizarPrecioComanda();
    });

    document.getElementById('comanda-plato')?.addEventListener('change', actualizarPrecioComanda);
    document.getElementById('comanda-cantidad')?.addEventListener('input', actualizarPrecioComanda);

    document.getElementById('input-archivo-backup')?.addEventListener('change', importarBaseDatosJSON);

    // Inactividad
    iniciarTimerInactividad(() => {
        mostrarToast('Sesión cerrada automáticamente por 20 minutos de inactividad.', 'warning');
        setTimeout(() => location.reload(), 1000);
    });

    // Verificación de cambio de día a medianoche
    verificarCambioDeFecha();
    setInterval(verificarCambioDeFecha, 60000);

    // Estado de sesión al cargar
    if (estaAutenticado()) {
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
        document.getElementById('app-sidebar').style.display = 'flex';
        document.getElementById('app-main').style.display = 'flex';
        actualizarPerfilUsuario();
        actualizarVistas();
    }
}

// Iniciar automáticamente cuando el DOM esté listo en navegador
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', iniciarApp);
}
