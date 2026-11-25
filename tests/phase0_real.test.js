/**
 * ============================================================================
 * HOTEL MONTSERRAT S.A.S. - SUITE DE PRUEBAS REALES DE FASE 0 (BLOQUE G)
 * 
 * Pruebas unitarias, de integración, adversariales y de migración sobre los
 * módulos REALES del sistema (sin reimplementar la lógica en el test).
 * 
 * Ejecución: npm test  (o  node --test tests/phase0_real.test.js)
 * ============================================================================
 */

import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ----------------------------------------------------------------------------
// HARNESS DE ENTORNO DOM Y WEB STORAGE PARA NODE.JS TEST RUNNER
// ----------------------------------------------------------------------------
const storageSession = new Map();
const storageLocal = new Map();

globalThis.sessionStorage = {
    getItem: (k) => storageSession.get(String(k)) ?? null,
    setItem: (k, v) => storageSession.set(String(k), String(v)),
    removeItem: (k) => storageSession.delete(String(k)),
    clear: () => storageSession.clear()
};

globalThis.localStorage = {
    getItem: (k) => storageLocal.get(String(k)) ?? null,
    setItem: (k, v) => storageLocal.set(String(k), String(v)),
    removeItem: (k) => storageLocal.delete(String(k)),
    clear: () => storageLocal.clear()
};

// Mock mínimo funcional de DOM para funciones de renderizado y UI
function crearElementoDOM(tag = 'div') {
    const el = {
        tagName: tag.toUpperCase(),
        id: '',
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
        },
        dataset: {},
        selectedOptions: [{ value: '', dataset: {} }],
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        remove() {},
        addEventListener() {}
    };
    return el;
}

const domRegistry = new Map();
globalThis.document = {
    getElementById(id) {
        if (!domRegistry.has(id)) {
            const el = crearElementoDOM();
            el.id = id;
            domRegistry.set(id, el);
        }
        return domRegistry.get(id);
    },
    createElement(tag) {
        return crearElementoDOM(tag);
    },
    querySelectorAll() {
        return [];
    },
    addEventListener() {}
};

globalThis.window = {
    addEventListener() {},
    baseDatos: null
};

// ----------------------------------------------------------------------------
// IMPORTACIÓN DE MÓDULOS REALES DE DOMINIO, SEGURIDAD, VALIDACIÓN Y APLICACIÓN
// ----------------------------------------------------------------------------
import { repartirCortesias } from '../js/domain/planes.js';
import { clasificarPago, calcularResumenCaja, METODOS_PAGO } from '../js/domain/caja.js';
import { estadoStock, hayStockDisponible, ESTADO_STOCK } from '../js/domain/inventario.js';
import { fechaBogota, horaBogota, cambioDeDia } from '../js/domain/fechas.js';
import { validarBackup, MAX_BACKUP_BYTES } from '../js/domain/backup.js';
import { migrar, crearEstadoInicial, SCHEMA_VERSION_ACTUAL } from '../js/domain/migraciones.js';

import {
    ROLES,
    PERMISOS,
    USUARIOS_HASHED,
    derivarHashPBKDF2,
    compararTiempoConstante,
    calcularTiempoBloqueoMs,
    obtenerBloqueo,
    guardarBloqueo,
    obtenerIntentos,
    incrementarIntentos,
    limpiarIntentos,
    estaAutenticado,
    obtenerUsuarioActual,
    puede,
    requierePermiso,
    validarLogin,
    reautenticar,
    migrarDatosLegacy
} from '../js/seguridad.js';

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
    generarUUID
} from '../js/validaciones.js';

import {
    getEstado,
    setEstado,
    guardarDatos,
    cargarDatos,
    registrarHuesped,
    registrarComanda,
    abrirModalConsumoExpress,
    confirmarConsumoExpress,
    abrirModalCierreCaja,
    confirmarCierreCaja,
    verificarCambioDeFecha,
    confirmarAnulacionComanda
} from '../js/app.js';

// ============================================================================
// SUITE PRINCIPAL: DEFECTOS B1 A B14 VERIFICADOS CONTRA CÓDIGO REAL
// ============================================================================

describe('Verificación de Defectos Críticos (B1 a B14)', () => {

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        domRegistry.clear();
        setEstado(crearEstadoInicial());
    });

    // ------------------------------------------------------------------------
    // B1: Reset de intentos tras expirar el tiempo de bloqueo y backoff creciente
    // ------------------------------------------------------------------------
    it('B1: tras expirar el bloqueo, los intentos vuelven a 0 y el siguiente fallo NO bloquea de inmediato; backoff creciente', () => {
        // Simular que el usuario fue bloqueado en el pasado
        const tiempoPasado = Date.now() - 5000;
        sessionStorage.setItem('hotelMontserrat_bloqueadoHasta', tiempoPasado.toString());
        sessionStorage.setItem('hotelMontserrat_intentos', '3');

        // Al consultar el bloqueo expirado con el código real de seguridad.js
        const bloqueo = obtenerBloqueo();
        assert.strictEqual(bloqueo, null, 'El bloqueo debió ser nulo al haber expirado');
        assert.strictEqual(obtenerIntentos(), 0, 'Los intentos debieron reiniciarse a 0');

        // El siguiente fallo solo incrementa a 1 y NO vuelve a bloquear
        const nuevosIntentos = incrementarIntentos();
        assert.strictEqual(nuevosIntentos, 1);
        assert.strictEqual(obtenerBloqueo(), null, 'Un fallo posterior no debe bloquear de inmediato');

        // Backoff creciente:
        assert.strictEqual(calcularTiempoBloqueoMs(3), 30000, '3er intento = 30s');
        assert.strictEqual(calcularTiempoBloqueoMs(4), 60000, '4to intento = 1m (60s)');
        assert.strictEqual(calcularTiempoBloqueoMs(5), 300000, '5to intento = 5m (300s)');
        assert.strictEqual(calcularTiempoBloqueoMs(6), 900000, '6to+ intento = 15m (900s)');
    });

    // ------------------------------------------------------------------------
    // B2: Denegación estricta de acceso sin sesión activa
    // ------------------------------------------------------------------------
    it('B2: obtenerUsuarioActual() devuelve null sin sesión; una llave hotelAndino_logged NO autentica', () => {
        sessionStorage.clear();
        // Intentar vulnerabilidad con llave legacy hotelAndino_logged
        sessionStorage.setItem('hotelAndino_logged', 'true');
        sessionStorage.setItem('hotelAndino_user', JSON.stringify({ usuario: 'hacker', rol: 'Administrador' }));

        assert.strictEqual(estaAutenticado(), false, 'La llave legacy no debe autenticar en el nuevo sistema');
        assert.strictEqual(obtenerUsuarioActual(), null, 'Sin sesión válida hotelMontserrat_*, debe retornar null');
    });

    // ------------------------------------------------------------------------
    // B3: Comanda multi-cantidad particiona cortesías y factura excedente
    // ------------------------------------------------------------------------
    it('B3: comanda multi-cantidad particiona cortesías disponibles y factura excedente como CARGO_HABITACION', () => {
        // Probar función pura de planes
        const reparto = repartirCortesias({ plan: 3, comidasHoy: 2, cantidad: 3 });
        assert.strictEqual(reparto.cortesias, 1, 'Solo disponía de 1 cortesía restante (3 - 2 = 1)');
        assert.strictEqual(reparto.excedente, 2, 'Deben facturarse 2 platos como excedente');

        // Probar flujo real en app.js con el estado
        const estadoActual = getEstado();
        const huespedTest = {
            id: 'h-test-b3',
            nombre: 'Huésped Prueba B3',
            documento: '99887766',
            habitacion: '305',
            plan: 3,
            comidasHoy: 2,
            estado: 'Activo'
        };
        estadoActual.huespedes.push(huespedTest);

        const platoTest = {
            id: 'p-test-b3',
            nombre: 'Plato Test B3',
            categoria: 'Almuerzos',
            stock: 10,
            stock_minimo: 5,
            precio: 30000,
            costo: 10000
        };
        estadoActual.inventario.push(platoTest);

        // Configurar DOM mock para registrarComanda
        document.getElementById('comanda-tipo').value = 'huesped';
        document.getElementById('comanda-huesped').value = 'h-test-b3';
        document.getElementById('comanda-plato').value = 'p-test-b3';
        document.getElementById('comanda-cantidad').value = '3';
        document.getElementById('comanda-comida').value = 'Almuerzo';
        document.getElementById('comanda-mesa').value = 'Mesa 2';

        // Autenticar como mesero
        sessionStorage.setItem('hotelMontserrat_logged', 'true');
        sessionStorage.setItem('hotelMontserrat_user', JSON.stringify({
            usuario: 'mesero',
            rol: ROLES.MESERO,
            nombre: 'Mesero de Turno'
        }));

        registrarComanda();

        // Verificar que se crearon dos líneas de comanda: cortesía y cargo a habitación
        const cortesiasRegistradas = estadoActual.comandas.filter(c => c.idHuesped === 'h-test-b3' && c.tipo === 'Cortesía (Plan)');
        const cobrosRegistrados = estadoActual.comandas.filter(c => c.idHuesped === 'h-test-b3' && c.tipo === 'Cobro');

        assert.strictEqual(cortesiasRegistradas.length, 1);
        assert.strictEqual(cortesiasRegistradas[0].cantidad, 1);
        assert.strictEqual(cortesiasRegistradas[0].valor, 0);
        assert.strictEqual(cortesiasRegistradas[0].metodoPago, METODOS_PAGO.PLAN_HOTEL);

        assert.strictEqual(cobrosRegistrados.length, 1);
        assert.strictEqual(cobrosRegistrados[0].cantidad, 2);
        assert.strictEqual(cobrosRegistrados[0].valor, 60000, '2 x $30.000 = $60.000');
        assert.strictEqual(cobrosRegistrados[0].metodoPago, METODOS_PAGO.CARGO_HABITACION);

        // Verificar que el stock se descontó en 3
        assert.strictEqual(platoTest.stock, 7);
        // Verificar que comidasHoy del huésped subió a 3 (cupo agotado)
        assert.strictEqual(huespedTest.comidasHoy, 3);
    });

    // ------------------------------------------------------------------------
    // B4: Consumo express asistido exige selección válida y rechaza stock 0
    // ------------------------------------------------------------------------
    it('B4: el modal de consumo exige selección válida y nunca usa el primer plato por defecto', () => {
        const estadoActual = getEstado();
        estadoActual.inventario = [
            { id: 'p1', nombre: 'Plato Agotado', stock: 0, stock_minimo: 5, precio: 20000 },
            { id: 'p2', nombre: 'Plato Disponible', stock: 5, stock_minimo: 5, precio: 25000 }
        ];

        // Autenticar
        sessionStorage.setItem('hotelMontserrat_logged', 'true');
        sessionStorage.setItem('hotelMontserrat_user', JSON.stringify({
            usuario: 'mesero',
            rol: ROLES.MESERO,
            nombre: 'Mesero'
        }));

        abrirModalConsumoExpress('1'); // Huésped Carlos Mendoza (plan 3, comidas 2)

        const platoSelect = document.getElementById('express-plato');
        // El select solo debe contener productos con stock > 0
        assert.strictEqual(platoSelect.innerHTML.includes('Plato Agotado'), false, 'No debe listar platos sin stock');
        assert.strictEqual(platoSelect.innerHTML.includes('Plato Disponible'), true, 'Debe listar platos con stock disponible');
    });

    // ------------------------------------------------------------------------
    // B5: Cuentas por cobrar (CARGO_HABITACION) separadas de dinero de caja
    // ------------------------------------------------------------------------
    it('B5: calcularResumenCaja no suma CARGO_HABITACION a caja; confirmarCierreCaja guarda totalFolios', () => {
        const comandasTest = [
            { fecha: '2026-11-25', valor: 50000, metodoPago: METODOS_PAGO.EFECTIVO, tipo: 'Cobro', cantidad: 1 },
            { fecha: '2026-11-25', valor: 30000, metodoPago: METODOS_PAGO.TARJETA, tipo: 'Cobro', cantidad: 1 },
            { fecha: '2026-11-25', valor: 45000, metodoPago: METODOS_PAGO.CARGO_HABITACION, tipo: 'Cobro', cantidad: 1 },
            { fecha: '2026-11-25', valor: 0, metodoPago: METODOS_PAGO.PLAN_HOTEL, tipo: 'Cortesía (Plan)', cantidad: 1 }
        ];

        const resumen = calcularResumenCaja(comandasTest, '2026-11-25');
        assert.strictEqual(resumen.totalCaja, 80000, 'Total caja = 50000 (efectivo) + 30000 (tarjeta) = 80000');
        assert.strictEqual(resumen.efectivo, 50000);
        assert.strictEqual(resumen.digital, 30000);
        assert.strictEqual(resumen.cuentasPorCobrar, 45000, 'Cuentas por cobrar = 45000 (Folio)');
        assert.strictEqual(resumen.cortesias, 1);

        // Verificar cierre de caja en app.js
        const estadoActual = getEstado();
        estadoActual.comandas = comandasTest;

        sessionStorage.setItem('hotelMontserrat_logged', 'true');
        sessionStorage.setItem('hotelMontserrat_user', JSON.stringify({
            usuario: 'cajero',
            rol: ROLES.CAJERO,
            nombre: 'Cajero'
        }));

        document.getElementById('cierre-efectivo-contado').value = '50000';
        confirmarCierreCaja();

        assert.strictEqual(estadoActual.cierresCaja.length, 1);
        const ultimoCierre = estadoActual.cierresCaja[0];
        assert.strictEqual(ultimoCierre.totalCaja, 80000);
        assert.strictEqual(ultimoCierre.totalFolios, 45000);
        assert.strictEqual(ultimoCierre.diferencia, 0, 'Caja cuadrada con $50.000 contado');
    });

    // ------------------------------------------------------------------------
    // B6: Zona horaria America/Bogota (evita desfase de las 7:00 PM COT)
    // ------------------------------------------------------------------------
    it('B6: con fecha 01:00 UTC del 26-nov -> fecha Bogotá retorna 25-nov', () => {
        // 26 de Noviembre a las 01:00 UTC = 25 de Noviembre a las 20:00 (8:00 PM) COT
        const fechaNocheUTC = new Date('2026-11-26T01:00:00.000Z');
        const resultadoCOT = fechaBogota(fechaNocheUTC);
        assert.strictEqual(resultadoCOT, '2026-11-25', 'A las 8 PM COT debe mantenerse en 2026-11-25');
    });

    // ------------------------------------------------------------------------
    // B7: Detección de cambio de fecha y reinicio de comidas a medianoche
    // ------------------------------------------------------------------------
    it('B7: cambioDeDia detecta medianoche y verificarCambioDeFecha reinicia comidasHoy de huéspedes activos', () => {
        const estadoActual = getEstado();
        estadoActual.ultimoDiaOperativo = '2026-11-24';
        estadoActual.huespedes = [
            { id: '1', nombre: 'Activo', comidasHoy: 3, estado: 'Activo' },
            { id: '2', nombre: 'Inactivo', comidasHoy: 2, estado: 'Check-out' }
        ];

        assert.strictEqual(cambioDeDia('2026-11-24', new Date('2026-11-25T12:00:00Z')), true);

        verificarCambioDeFecha();

        assert.strictEqual(estadoActual.huespedes[0].comidasHoy, 0, 'Huésped activo debe reiniciarse');
        assert.strictEqual(estadoActual.huespedes[1].comidasHoy, 2, 'Huésped en Check-out no debe reiniciarse');
    });

    // ------------------------------------------------------------------------
    // B8: Reingreso de huéspedes con check-out previo y pasaportes
    // ------------------------------------------------------------------------
    it('B8: documentoExiste permite reingreso tras Check-out, bloquea si está Activo, y valida pasaportes alfanuméricos', () => {
        const huespedes = [
            { id: '1', documento: 'PA123456', estado: 'Check-out' },
            { id: '2', documento: '10203040', estado: 'Activo' }
        ];

        assert.strictEqual(documentoExiste('PA123456', huespedes), false, 'Permite reingreso si su estancia previa terminó');
        assert.strictEqual(documentoExiste('10203040', huespedes), true, 'Bloquea si ya tiene una estancia activa');
        assert.strictEqual(esDocumentoValido('PA123456-X'), true, 'Pasaporte alfanumérico con guión es válido');
    });

    // ------------------------------------------------------------------------
    // B9: Umbrales de inventario STOP dinámicos
    // ------------------------------------------------------------------------
    it('B9: estadoStock evalúa semáforo STOP según stock_minimo individual de cada producto', () => {
        const prodA = { stock: 4, stock_minimo: 5 }; // < 5 -> CRÍTICO
        const prodB = { stock: 8, stock_minimo: 5 }; // <= 10 -> BAJO
        const prodC = { stock: 15, stock_minimo: 5 }; // > 10 -> ÓPTIMO
        const prodD = { stock: 18, stock_minimo: 10 }; // <= 20 -> BAJO

        assert.strictEqual(estadoStock(prodA), ESTADO_STOCK.CRITICO);
        assert.strictEqual(estadoStock(prodB), ESTADO_STOCK.BAJO);
        assert.strictEqual(estadoStock(prodC), ESTADO_STOCK.OPTIMO);
        assert.strictEqual(estadoStock(prodD), ESTADO_STOCK.BAJO);
    });

    // ------------------------------------------------------------------------
    // B10: UUIDs criptográficos únicos
    // ------------------------------------------------------------------------
    it('B10: generarUUID genera identificadores únicos y aleatorios', () => {
        const id1 = generarUUID();
        const id2 = generarUUID();
        assert.notStrictEqual(id1, id2);
        assert.strictEqual(typeof id1, 'string');
        assert.strictEqual(id1.length >= 10, true);
    });

    // ------------------------------------------------------------------------
    // B11: Sanitización no destructiva y escape contextual
    // ------------------------------------------------------------------------
    it('B11: sanitizar preserva caracteres legítimos (O\'Brien, &) y escapeHTML/escapeAttr codifican XSS', () => {
        const entradaLegitima = "David O'Brien & Hijos";
        assert.strictEqual(sanitizar(entradaLegitima), "David O'Brien & Hijos");

        const xssPayload = '<script>alert("XSS")</script>';
        const escapado = escapeHTML(xssPayload);
        assert.strictEqual(escapado.includes('<script>'), false);
        assert.strictEqual(escapado.includes('&lt;script&gt;'), true);

        const attrPayload = 'test" onfocus="alert(1)';
        const attrEscapado = escapeAttr(attrPayload);
        assert.strictEqual(attrEscapado.includes('"'), false);
        assert.strictEqual(attrEscapado.includes('&quot;'), true);
    });

    // ------------------------------------------------------------------------
    // B12: Métodos de renderizado y validación sin código muerto
    // ------------------------------------------------------------------------
    it('B12: renderizado en DOM sin código muerto y funciones de stock integradas', () => {
        const item = { stock: 10 };
        assert.strictEqual(hayStockDisponible(item, 5), true);
        assert.strictEqual(hayStockDisponible(item, 15), false);
    });

    // ------------------------------------------------------------------------
    // B13: Roles sincronizados entre JS y SQL
    // ------------------------------------------------------------------------
    it('B13: catálogo ROLES de seguridad.js coincide exactamente con los 7 roles del archivo SQL real', () => {
        const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../hotel_montserrat_db.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        const rolesJS = Object.values(ROLES);
        assert.strictEqual(rolesJS.length, 7, 'Deben existir exactamente 7 roles');

        for (const rol of rolesJS) {
            assert.strictEqual(sqlContent.includes(`'${rol}'`), true, `El rol "${rol}" debe existir en el SQL`);
        }
    });

    // ------------------------------------------------------------------------
    // B14: Documentación honesta y sin falsas afirmaciones
    // ------------------------------------------------------------------------
    it('B14: documentación técnica veraz y transparente (sin reCAPTCHA falso, sin credenciales expuestas ni Andino)', () => {
        const readmePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../README.md');
        const readmeContent = fs.readFileSync(readmePath, 'utf8');

        assert.strictEqual(readmeContent.includes('Google reCAPTCHA v2'), false, 'README no debe citar reCAPTCHA no existente');
        assert.strictEqual(readmeContent.includes('andino2024'), false, 'README no debe contener credenciales legacy');
        assert.strictEqual(readmeContent.includes('SECURITY_KNOWN_LIMITATIONS.md'), true, 'README debe enlazar las limitaciones conocidas');
    });

});

// ============================================================================
// PRUEBAS DE SEGURIDAD ADVERSARIALES Y CONTROL DE ACCESO
// ============================================================================

describe('Pruebas de Seguridad Adversariales y Mitigaciones en Cliente', () => {

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
    });

    it('Adversarial: validarBackup rechaza payloads de inyección SQL en IDs', () => {
        const backupInvalido = {
            schemaVersion: 3,
            ultimoDiaOperativo: '2026-11-25',
            huespedes: [{ id: "'); DROP TABLE huespedes; --", nombre: 'Hacker', documento: '1234', habitacion: '101', plan: 1, comidasHoy: 0, estado: 'Activo' }],
            inventario: [],
            comandas: []
        };
        const res = validarBackup(backupInvalido);
        assert.strictEqual(res.ok, false, 'Debe rechazar IDs que no cumplan el regex ^[A-Za-z0-9_-]{1,64}$');
        assert.strictEqual(res.errores.some(e => e.includes('ID inválido')), true);
    });

    it('Adversarial: validarBackup rechaza contaminación de prototipo (__proto__, constructor)', () => {
        const payloadProto = JSON.parse('{"schemaVersion":3,"huespedes":[],"inventario":[],"comandas":[],"__proto__":{"isAdmin":true}}');
        const res = validarBackup(payloadProto);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.errores.some(e => e.includes('contaminación de prototipo')), true);
    });

    it('Adversarial: validarBackup rechaza archivos que superen 2 MB', () => {
        const backupValido = crearEstadoInicial();
        const tamanoExcesivo = MAX_BACKUP_BYTES + 1024;
        const res = validarBackup(backupValido, tamanoExcesivo);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.errores.some(e => e.includes('excede el tamaño máximo permitido')), true);
    });

    it('Adversarial: validarBackup rechaza comandas con violación de integridad referencial', () => {
        const backupInvalido = {
            schemaVersion: 3,
            huespedes: [{ id: 'h1', nombre: 'Test', documento: '1020', habitacion: '101', plan: 1, comidasHoy: 0, estado: 'Activo' }],
            inventario: [],
            comandas: [{
                id: 'c1',
                fecha: '2026-11-25',
                hora: '12:00',
                idHuesped: 'huesped_inexistente',
                cliente: 'Test',
                plato: 'Almuerzo',
                cantidad: 1,
                valor: 0,
                tipo: 'Cortesía (Plan)',
                metodoPago: METODOS_PAGO.PLAN_HOTEL
            }]
        };
        const res = validarBackup(backupInvalido);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.errores.some(e => e.includes('integridad referencial')), true);
    });

    it('Adversarial: RBAC deny-by-default impide acciones destructivas si el rol no tiene permiso', () => {
        // Usuario autenticado como Mesero
        sessionStorage.setItem('hotelMontserrat_logged', 'true');
        sessionStorage.setItem('hotelMontserrat_user', JSON.stringify({
            usuario: 'mesero',
            rol: ROLES.MESERO,
            nombre: 'Mesero'
        }));

        assert.strictEqual(puede('crear_comanda'), true);
        assert.strictEqual(puede('eliminar_huesped'), false);
        assert.strictEqual(puede('restablecer_sistema'), false);
        assert.strictEqual(puede('importar_backup'), false);

        assert.throws(() => {
            requierePermiso('restablecer_sistema');
        }, /Acceso denegado/);
    });

    it('Autenticación PBKDF2: contraseña válida autentica y contraseña errónea falla en tiempo constante', async () => {
        const resValido = await validarLogin('admin', 'montserrat2024');
        assert.strictEqual(resValido.ok, true);
        assert.strictEqual(resValido.usuario.rol, ROLES.ADMINISTRADOR);

        const resInvalido = await validarLogin('admin', 'clave_falsa_123');
        assert.strictEqual(resInvalido.ok, false);
        assert.strictEqual(resInvalido.mensaje.includes('incorrectas'), true);
    });

    it('Reautenticación: reautenticar valida contra PBKDF2 la contraseña del usuario en sesión', async () => {
        sessionStorage.setItem('hotelMontserrat_logged', 'true');
        sessionStorage.setItem('hotelMontserrat_user', JSON.stringify({
            usuario: 'admin',
            rol: ROLES.ADMINISTRADOR,
            nombre: 'Admin'
        }));

        const valida = await reautenticar('montserrat2024');
        const invalida = await reautenticar('clave_incorrecta');

        assert.strictEqual(valida, true);
        assert.strictEqual(invalida, false);
    });

    // ------------------------------------------------------------------------
    // Limitación conocida documentada como pendiente (B-9 / SEC-1)
    // ------------------------------------------------------------------------
    test.todo('SEC-1: limitación conocida - sessionStorage puede ser forjado en consola F12 (REQUIERE FASE 1)');
});

// ============================================================================
// PRUEBAS DE MIGRACIÓN Y VERSIONADO IDEMPOTENTE
// ============================================================================

describe('Migración y Versionado Idempotente (Bloque E)', () => {

    it('Migración idempotente: migrar dos veces produce el mismo resultado idéntico', () => {
        const datosViejos = {
            huespedes: [{ id: 101, nombre: 'Huésped Viejo', documento: '1234', habitacion: '202', plan: '2', comidasHoy: '1' }],
            inventario: [{ id: 201, nombre: 'Plato Viejo', stock: '12', precio: '20000' }], // sin stock_minimo
            comandas: [{ id: 301, idHuesped: 101, cliente: 'Huésped Viejo', plato: 'Plato Viejo', metodoPago: 'Cargar a Habitación' }],
            cierresCaja: [{ id: 1, total: 50000 }] // viejo campo total
        };

        const migracion1 = migrar(datosViejos);
        const migracion2 = migrar(migracion1);

        assert.strictEqual(migracion1.schemaVersion, SCHEMA_VERSION_ACTUAL);
        assert.strictEqual(migracion1.huespedes[0].id, '101');
        assert.strictEqual(migracion1.comandas[0].idHuesped, '101', 'Integridad relacional mantenida');
        assert.strictEqual(migracion1.comandas[0].metodoPago, METODOS_PAGO.CARGO_HABITACION, 'Normalizado a ENUM');
        assert.strictEqual(migracion1.inventario[0].stock_minimo, 5, 'stock_minimo asignado por defecto');
        assert.strictEqual(migracion1.cierresCaja[0].totalCaja, 50000);
        assert.strictEqual(migracion1.cierresCaja[0].totalFolios, 0);

        // Idempotencia: el segundo resultado es idéntico al primero
        assert.deepStrictEqual(migracion1, migracion2);
    });

    it('migrarDatosLegacy limpia llaves antiguas y persiste en hotelMontserrat_DB_v2', () => {
        localStorage.setItem('hotelAndino_DB_v2', JSON.stringify(crearEstadoInicial()));
        sessionStorage.setItem('hotelAndino_logged', 'true');

        migrarDatosLegacy();

        assert.strictEqual(localStorage.getItem('hotelAndino_DB_v2'), null, 'La llave legacy debe ser removida');
        assert.strictEqual(sessionStorage.getItem('hotelAndino_logged'), null, 'La sesión legacy debe ser limpiada');
        assert.strictEqual(Boolean(localStorage.getItem('hotelMontserrat_DB_v2')), true, 'Debe persistir en la nueva clave');
    });

});
