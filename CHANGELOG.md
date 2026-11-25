# 📜 Registro de Cambios (CHANGELOG)
## Hotel Montserrat S.A.S. — Sistema de Gestión Hotelera & POS

Todas las modificaciones notables realizadas a este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [3.0.0] - 2026-11-25 — Versión de Producción (Fases 0, 1, 2, 3 y 4 Completadas)

### 🚀 Nuevas Características
- **Backend Node.js Modular (Express-compatible):** Servidor HTTP nativo con pipeline de seguridad, parsing con control estricto de DoS (máx 100 KB) y arquitectura en capas (`src/controllers`, `src/services`, `src/middlewares`, `src/repositories`, `src/db`).
- **Autenticación Robusta en Servidor:** Hashing con PBKDF2/Argon2 + sal individual por usuario + pepper secreto de servidor (`SERVER_PEPPER_SECRET`). Comparación en tiempo constante con `crypto.timingSafeEqual`.
- **Gestión de Sesiones Server-Side:** Tokens criptográficos de 256 bits (64 hex), rotación de ID anti session fixation, cookies `HttpOnly; Secure; SameSite=Strict`, expiración dual (12 h absoluta / 20 min inactividad) y endpoint de revocación global.
- **Autorización RBAC Server-Side (Deny-by-Default):** 7 roles oficiales (`Administrador`, `Gerente`, `Cajero`, `Mesero`, `Recepción`, `Bodega`, `Auditor`). Validación obligatoria en cada endpoint REST.
- **Atribución Inviolable del Operador (B-5):** En comandas y operaciones críticas, el operador es extraído automáticamente de la sesión del servidor (no editable por select).
- **Anti Fuerza Bruta en Servidor:** Backoff progresivo por usuario e IP (30s → 1m → 5m → 15m; HTTP 429 Too Many Requests).
- **Hardening de Transporte:** Cabeceras Helmet estrictas: CSP (`default-src 'self'`), HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CORS restringido a orígenes autorizados.
- **Auditoría Forense Inmutable:** Servicio de bitácora append-only (`auditService.js`) con formato ISO estructurado y tabla SQL `bitacora_auditoria`.
- **Transacciones ACID:** Gestor `ejecutarTransaccion()` con soporte de Rollback automático ante cualquier fallo de inventario o validación.
- **Separación Persona / Estancias:** División en `huespedes` y `estancias` permitiendo múltiples visitas históricas para un mismo documento sin violaciones de unicidad.
- **Control de Ocupación (Anti Doble Check-in):** Catálogo de `habitaciones` con control de estados (`Disponible`, `Ocupada`, `Mantenimiento`).
- **Validación Documental Colombiana:** Reglas estrictas de validación para `CC`, `CE`, `PASAPORTE` y `NIT`.
- **Liquidación de Folios al Check-out:** Consolidación de cuentas por cobrar cargadas a habitación (`total_folio`) y liberación automática de habitaciones.
- **Congelamiento de Precios (Price Freezing):** Snapshot del precio unitario en comanda al momento de la orden.
- **Trazabilidad de Inventario STOP:** Registro inmutable en `movimientos_inventario` (entradas, salidas, ajustes, responsable y motivo).
- **Orquestación con Docker Compose:** MySQL 8.0 (UTF8mb4, healthcheck, volumen persistente) y Node.js 20 LTS multi-stage (usuario no-root).

### 🐛 Defectos Críticos Corregidos (B1 a B14)
- **B1:** Corregido reinicio del contador de intentos fallidos al expirar el bloqueo por backoff.
- **B2:** Eliminada elevación de privilegios en `obtenerUsuarioActual()`; retorna estrictamente `null` si no hay sesión activa.
- **B3:** Partición automática en comandas multi-cantidad: cupos cubiertos como cortesía del plan ($0) y excedente facturado en línea separada.
- **B4:** Modal asistido de consumo express con selección obligatoria de plato y momento de comida.
- **B5:** Segregación estricta en caja: los cargos a habitación se asignan a folios (cuentas por cobrar) y no suman a efectivo/digital.
- **B6:** Normalización de fechas y horas en zona horaria oficial `America/Bogota` (COT UTC-5).
- **B7:** Detección automática del cambio de fecha en medianoche con reinicio de comidas de cortesía.
- **B8:** Reingreso histórico permitido para huéspedes con estancias previas finalizadas.
- **B9:** Umbral STOP dinámico individual por producto (`stock_minimo`).
- **B10:** Generación de identificadores criptográficos aleatorios (UUID v4 / crypto tokens).
- **B11:** Sanitización no destructiva y codificación contextual (`escapeHTML`, `escapeAttr`).
- **B12:** Eliminación de código muerto y optimización de renderizado en DOM.
- **B13:** Homologación total de roles entre frontend, backend y base de datos SQL.
- **B14:** Documentación veraz y transparente; eliminación de simulaciones cosméticas engañosas.

---

## [2.0.0] - 2026-11-25 — Fase 0 (Cierre de Prototipo Frontend)
- Desacoplamiento de funciones puras de dominio en `js/domain/`.
- Módulos ES nativos (`<script type="module">`).
- Eliminación del 100% de `onclick` inline y transición a delegación de eventos.
- Hashing PBKDF2 WebCrypto con sal individual por usuario.
- Validación estructural todo-o-nada de backups (límite 2 MB, anti-prototype pollution).
- Suite de pruebas unitarias automatizadas con `node:test`.

---

## [1.0.0] - Prototipo Inicial (Legacy)
- Prototipo inicial 100% cliente en localStorage.
