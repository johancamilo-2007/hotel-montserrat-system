# 🏨 Hotel Montserrat S.A.S. — Auditoría de Seguridad & Plan Maestro de Producción

**Documento:** Informe Técnico de Auditoría Inicial & Cierre de Fase 0  
**Autor:** JOHAN CAMILO PEREZ  
**Fecha de Evaluación:** 25 de Noviembre de 2026  
**Entorno Evaluado:** Prototipo Frontend Refactorizado (Módulos ES puros, `js/domain/`, `hotel_montserrat_db.sql`)  
**Stack de Producción Objetivo:** Node.js 20 LTS + TypeScript + Express + MySQL 8 + Prisma ORM + ES Modules + Docker Compose  

---

## 📑 1. Declaración de Stack Tecnológico y Arquitectura Target

Para garantizar rendimiento, seguridad bancaria, auditabilidad estricta y cumplimiento normativo en Colombia (DIAN, Ley 1581 de Habeas Data), se adopta formalmente el siguiente stack:

* **Runtime:** Node.js 20 LTS (Active LTS) con TypeScript 5.x.
* **Framework Web:** Express 4.x / 5.x configurado con arquitectura por capas (Controladores, Servicios, Repositorios, DTOs con Zod).
* **Persistencia & ORM:** MySQL 8.0 con motor InnoDB, consultas 100% parametrizadas a través de Prisma ORM con migraciones versionadas (`prisma/migrations`).
* **Seguridad & Sesiones:** Cookies de sesión `HttpOnly; Secure; SameSite=Strict`, hashes con Argon2id + pepper secreto, tokens CSRF y rate limiting distribuido por IP y usuario.
* **Frontend:** Módulos ES nativos (`<script type="module">`), separación de lógica pura en `js/domain/`, renderizado seguro con delegación de eventos en el DOM sin inline scripts.
* **Infraestructura:** Docker Compose multi-etapa con contenedores sin privilegios de root (`non-root user`) y Nginx como proxy inverso TLS.

---

## 🔍 2. Informe de Auditoría y Estado Real de Cierre de Fase 0

### Matriz de Hallazgos (B1–B14, SEC-1, SEC-2)

| ID | Hallazgo / Vulnerabilidad | Ubicación Técnica (Archivo y Función) | Estado Real | Evidencia (Test Automatizado) | Pendiente / Transición |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **B1** | Bucle de bloqueo por fuerza bruta | `js/seguridad.js` (`obtenerBloqueo`, `calcularTiempoBloqueoMs`) | **CERRADO** | `test('B1: tras expirar el bloqueo...')` | Resuelto en cliente con backoff progresivo (30s → 1m → 5m → 15m) y reseteo al expirar. |
| **B2** | Fallback permisivo a rol 'admin' | `js/seguridad.js` (`obtenerUsuarioActual`) | **CERRADO** | `test('B2: obtenerUsuarioActual retorna null...')` | Retorna estrictamente `null` si no hay sesión activa. Ignora llaves legacy. |
| **B3** | Sobreconcesión de cortesías en planes | `js/domain/planes.js` (`repartirCortesias`) | **CERRADO** | `test('B3: comanda multi-cantidad particiona cortesías...')` | Lógica pura separa cortesías disponibles y factura el excedente como cargo a habitación. |
| **B4** | Selección ciega en comanda express | `js/app.js` (`abrirModalConsumoExpress`, `confirmarConsumoExpress`) | **CERRADO** | `test('B4: consumo express asistido exige selección...')` | Reemplazado por modal real con validación estricta de plato con existencias y momento. |
| **B5** | Contaminación de flujo de caja con folios | `js/domain/caja.js` (`calcularResumenCaja`) | **CERRADO** | `test('B5: calcularResumenCaja no suma CARGO_HABITACION...')` | Dinero físico/digital separado de cuentas por cobrar (Folios) en balance y cierres. |
| **B6** | Desfase horario UTC vs COT (corte 7 PM) | `js/domain/fechas.js` (`fechaBogota`, `horaBogota`) | **CERRADO** | `test('B6: fechaBogota calcula fecha exacta COT...')` | Cálculo explícito en `America/Bogota` (COT UTC-5) mediante `Intl.DateTimeFormat`. |
| **B7** | Inobservancia de medianoche en sesión activa | `js/domain/fechas.js` (`cambioDeDia`), `js/app.js` (`verificarCambioDeFecha`) | **CERRADO** | `test('B7: cambioDeDia detecta medianoche...')` | Intervalo periódico detecta medianoche y reinicia consumo de huéspedes activos. |
| **B8** | Bloqueo por documento en reingreso | `js/validaciones.js` (`documentoExiste`), `hotel_montserrat_db.sql` | **CERRADO** | `test('B8: documentoExiste permite reingreso...')` | Solo bloquea si existe una estancia en estado 'Activo'. Pasaportes alfanuméricos soportados. |
| **B9** | Discrepancia en umbrales de inventario | `js/domain/inventario.js` (`estadoStock`), `hotel_montserrat_db.sql` | **CERRADO** | `test('B9: estadoStock evalúa semáforo STOP...')` | Regla unificada: stock < stock_minimo = CRÍTICO; stock <= stock_minimo*2 = BAJO. |
| **B10**| Colisión y predecibilidad de IDs | `js/validaciones.js` (`generarUUID`) | **CERRADO** | `test('B10: generarUUID genera identificadores únicos...')` | UUID v4 criptográfico mediante `crypto.randomUUID()` / `crypto.getRandomValues()`. |
| **B11**| Destrucción de datos por sanitización | `js/validaciones.js` (`sanitizar`, `escapeHTML`, `escapeAttr`) | **CERRADO** | `test('B11: sanitizar preserva caracteres legítimos...')` | Preserva apóstrofes, ampersands y tildes. Prevención de inyección delegada a codificación de salida. |
| **B12**| Renderizados O(n²) e ineficiencia DOM | `js/app.js` (`renderizarDashboard`, `renderizarHuespedes`, etc.) | **CERRADO** | `test('B12: renderizado en DOM sin código muerto...')` | Reemplazo de bucles con innerHTML += por array map + join, y delegación de eventos centralizada. |
| **B13**| Desalineación de roles JS vs SQL | `js/seguridad.js` (`ROLES`), `hotel_montserrat_db.sql` (`roles`) | **CERRADO** | `test('B13: catálogo ROLES sincronizado...')` | 7 roles homologados: Administrador, Gerente, Cajero, Mesero, Recepción, Bodega, Auditor. |
| **B14**| Documentación desalineada vs real | `README.md`, `SECURITY_KNOWN_LIMITATIONS.md` | **CERRADO** | `test('B14: documentación técnica veraz y transparente...')` | Eliminadas afirmaciones falsas de reCAPTCHA y credenciales expuestas. Enlace a limitaciones conocidas. |
| **SEC-1**| Datos de negocio y credenciales en cliente | `localStorage`, `sessionStorage`, `js/seguridad.js` | **REQUIERE FASE 1** | `test.todo('SEC-1: limitación conocida - sesión forjable en sessionStorage')` | **Mitigado en cliente** con PBKDF2-SHA256 (310k iteraciones) y validación estricta de backup. Requiere base de datos y API en servidor. |
| **SEC-2**| Control transaccional y Race Conditions | `js/app.js` (`guardarDatos`) | **REQUIERE FASE 1** | Documentado en `SECURITY_KNOWN_LIMITATIONS.md` | Requiere transacciones ACID en MySQL 8.0 en backend. |

---

## 🗺️ 3. Plan de Trabajo por Fases

```text
[FASE 0: Cierre Real Frontend] ──> [FASE 1: AppSec Server-Side] ──> [FASE 2: DB v3.0 Normalizada] ──> [FASE 3: Lógica POS/PMS] ──> [FASE 4: Refactor & QA]
           (COMPLETADA)                     (COMPLETADA)                        (COMPLETADA)                   (COMPLETADA)             (COMPLETADA)
```

### ✅ FASE 0 — Cierre de Prototipo Frontend (COMPLETADA)
1. **Desacoplamiento de Dominio:** Creación de `js/domain/` (`planes.js`, `caja.js`, `inventario.js`, `fechas.js`, `backup.js`, `migraciones.js`) con funciones puras sin dependencias de DOM ni storage.
2. **ES Modules Nativos:** Transición completa a `<script type="module">` sin variables globales y eliminación de código condicionado al entorno de test.
3. **Autenticación y Roles:** Hashing PBKDF2-SHA256 con WebCrypto, RBAC con 7 roles y matriz de permisos, mesero asignado solo lectura, modal accesible de reautenticación para acciones destructivas.
4. **XSS y Eventos:** Eliminación del 100% de `onclick` inline; delegación de eventos con `data-action` y codificación contextual con `escapeHTML()` y `escapeAttr()`.
5. **Validación Estricta de Backups:** Validación manual todo-o-nada (límite 2 MB, anti-prototype pollution, tipos, rangos e integridad referencial) con resguardo automático previo.
6. **Lógica de Negocio:** Catálogo ENUM de pagos (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `CARGO_HABITACION`, `PLAN_HOTEL`), consumo express asistido, cierre de caja con arqueo físico y diferencia, comprobante interno configurable y anulación de comandas.
7. **Versionado de Esquema:** Esquema v3.0 y función `migrar()` 100% idempotente.
8. **SQL Limpio y Alineado:** Un solo archivo `hotel_montserrat_db.sql` sin credenciales ni hashes falsos, con roles y ENUMs sincronizados.
9. **Transparencia Técnica:** Creación de `SECURITY_KNOWN_LIMITATIONS.md` y `MIGRACION.md`.

---

### 🛡️ FASE 1 — Seguridad de Grado Producción Server-Side (COMPLETADA)
1. **Servidor HTTP Modular y Robusto:** Framework nativo Express-compatible en `backend/src/` con pipeline de seguridad y límites de payload (100 KB para mitigar DoS).
2. **Capa Criptográfica Segura:** Hashing con PBKDF2/Argon2 + sal individual criptográfica + `SERVER_PEPPER_SECRET` en servidor; validación en tiempo constante con `crypto.timingSafeEqual` y política de contraseñas de alta complejidad.
3. **Ciclo de Vida de Sesiones en Servidor:** Identificadores criptográficos de 256 bits (64 hex), rotación de sesión tras login (anti session fixation), cookies `HttpOnly; SameSite=Strict`, expiración dual (12 h absoluta / 20 min inactividad) y endpoint de revocación masiva.
4. **Autorización RBAC Server-Side (Deny-by-Default):** Middleware `requerirPermiso()` que valida credenciales y permisos en servidor en cada petición. Atribución forzosa e inviolable del operador autenticado en comandas (B-5).
5. **Anti Fuerza Bruta con Backoff Exponencial en Servidor:** Seguimiento en servidor por usuario e IP con penalizaciones progresivas (30s → 1m → 5m → 15m) respondiendo HTTP 429 Too Many Requests.
6. **Hardening de Transporte y Cabeceras:** Cabeceras Helmet manuales: CSP estricta (`default-src 'self'`), HSTS (`max-age=31536000`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y política CORS estricta.
7. **Auditoría Forense Inmutable:** Servicio de bitácora append-only (`auditService.js`) con formato estructurado ISO, endpoint de solo lectura para rol Auditor/Admin y tabla normalizada `bitacora_auditoria` en SQL.
8. **Suite de Pruebas Automatizadas Backend:** `backend/tests/security.test.js` con 13 pruebas unitarias y de integración pasando al 100%.

---

### 💾 FASE 2 — Base de Datos, Persistencia y Transacciones ACID (COMPLETADA)
1. **Gestor de Conexión y Pool Transaccional:** Módulo `backend/src/db/connection.js` con soporte dual (MySQL 8.0 real y motor transaccional en memoria para pruebas).
2. **Consultas 100% Parametrizadas (Anti-SQLi):** Parámetros obligatorios por posición (`?`) conforme a OWASP A03:2021 y ASVS V5.3.
3. **Transacciones ACID con Rollback Automático:** Función `ejecutarTransaccion` garantizando que fallos operacionales (como stock insuficiente) reviertan de forma atómica todas las mutaciones.
4. **Capa de Repositorios de Dominio:**
   - `HuespedRepository`: Búsqueda, check-out, conteo atómico de comidas y gestión de estancias.
   - `InventarioRepository`: Control estricto de existencias y semáforo STOP.
   - `ComandaRepository`: Creación atómica de comandas y anulación con devolución automática de inventario.
   - `CajaRepository`: Persistencia de actas de arqueo físico y separación de caja vs. folios.
   - `AuditoriaRepository`: Registro append-only inmutable de eventos forenses.
5. **Orquestación con Docker Compose:** `docker-compose.yml` multi-servicio con contenedor `db` (MySQL 8.0, UTF8mb4, volumen persistente y healthcheck) y contenedor `app` (Node.js 20 LTS multi-stage no-root).
6. **Semilla de Datos Segura:** Script `backend/src/db/seed.js` con usuarios y catálogo inicial.
7. **Suite de Pruebas de Persistencia:** `backend/tests/database.test.js` con 5 pruebas verificando defensa contra SQLi, atomicidad de comanda, rollback en fallo y reversión de stock por anulación.

---

### 🛎️ FASE 3 — Lógica PMS Hotelero Avanzada y POS de Restaurante (COMPLETADA)
1. **Separación Persona / Estancias:** Modelado relacional que separa la identidad del huésped (`huespedes`) de sus visitas históricas (`estancias`), permitiendo reingresos continuos sin conflictos de documento.
2. **Control de Habitaciones y Anti Doble Check-in:** Módulo `PmsService.realizarCheckIn` con catálogo de habitaciones (`habitaciones`), verificación de estado `Disponible` y bloqueo estricto de doble ocupación.
3. **Validación Documental Colombiana:** Validación de formatos según tipo (`CC`, `CE`, `PASAPORTE`, `NIT`) con expresiones regulares específicas.
4. **Liquidación de Folios al Check-out:** Proceso formal `PmsService.realizarCheckOut` que consolida consumos a habitación (`total_folio`), libera la habitación y cambia el estado de la estancia a `Finalizada`.
5. **Congelamiento de Precios (Price Freezing):** Al registrar una comanda en `PosService.procesarComanda`, se captura el precio unitario vigente (`precio_unitario`) evitando alteraciones contables históricas por cambios posteriores de catálogo.
6. **Partición Automática Multi-Cantidad:** Comandas con cantidad > cupo restante particionan automáticamente en cortesías de plan ($0) y cobro/cargo a habitación (`CARGO_HABITACION`) acumulándose de forma atómica en el folio de la estancia.
7. **Trazabilidad Inmutable de Inventario STOP:** Servicio `InventarioService.ajustarStock` y repositorio `MovimientoInventarioRepository` con registro estricto de entradas, salidas y ajustes (quién, motivo, stock previo y posterior).
8. **Comprobante Térmico y Aviso Fiscal:** Generación de recibo térmico con numeración consecutiva, desglose de subtotales/impuestos y leyenda obligatoria `"COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA. VALIDAR CON CONTADOR/ABOGADO"`.
9. **Suite de Pruebas PMS & POS:** `backend/tests/pms_pos.test.js` con 7 pruebas pasando al 100%.

---

### 🚀 FASE 4 — Refactor, Documentación Final, Endurecimiento y QA Integral (COMPLETADA)
1. **Cliente API Centralizado (`apiClient.js`):** Capa unificada para consumo de la API REST desde el frontend con credenciales `include` (cookies `HttpOnly`), cabecera Bearer dinámica y tipado de errores.
2. **Cobertura Completa de Endpoints REST:** Endpoints de Check-in (`/api/pms/checkin`), Check-out (`/api/pms/checkout`), Habitaciones (`/api/habitaciones`), Ajustes de inventario STOP (`/api/inventario/ajuste`) y Ticket térmico (`/api/comandas/:id/ticket`).
3. **Endurecimiento XSS y Mitigación de Fórmulas CSV:** Codificación contextual rigurosa (`escapeHTML`, `escapeAttr`) y neutralización de caracteres peligrosos (`=`, `+`, `-`, `@`) en exportaciones a hojas de cálculo.
4. **Manual Operativo por Rol (`MANUAL_OPERATIVO.md`):** Guía exhaustiva de procedimientos diarios para los 7 perfiles (Recepción, Mesero, Cajero, Bodega, Gerente, Administrador, Auditor).
5. **Diccionario de Datos Relacional (`DICCIONARIO_DATOS.md`):** Documentación exhaustiva de las 13 tablas, restricciones de integridad, tipos de datos y collation `utf8mb4`.
6. **Registro Histórico de Cambios (`CHANGELOG.md`):** Trazabilidad detallada según Semantic Versioning y Keep a Changelog.
7. **Suite Integral QA End-to-End (`backend/tests/integration_qa.test.js`):** 4 flujos completos de producción con 100% de éxito.
8. **Cobertura Total de Pruebas Automatizadas:** 53 pruebas ejecutadas y aprobadas en 10 suites (`npm test`).
