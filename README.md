# 🏨 Sistema de Gestión Hotelera & Restaurante - Hotel Montserrat S.A.S.

Sistema integral de gestión para hoteles y restaurantes desarrollado con arquitectura modular en el cliente, separación de lógica de dominio, persistencia local versionada (v3.0) y esquema relacional para MySQL/MariaDB.

---

## 🚀 Características Principales

### 1. 🛎️ Gestión y Derechos de Huéspedes
* **Validación de Planes de Alimentación:**
  * **Pensión Completa (3 comidas):** Desayuno, Almuerzo y Cena incluidos.
  * **Media Pensión (2 comidas):** 2 comidas diarias a elección.
  * **Alojamiento y Desayuno (1 comida):** 1 desayuno buffet diario.
  * **Solo Alojamiento (0 comidas):** Sin derecho a cortesía (consumos a tarifa normal).
* **Control de Consumo Diario:** Indicadores visuales en tiempo real (`X de Y servidas`). Partición automática de comandas multi-cantidad en cortesías del plan y cargos a habitación.
* **Reinicio Diario:** Control de medianoche en zona horaria `America/Bogota` (COT UTC-5).
* **Control de Estado:** Check-in, Check-out y reingresos históricos permitidos para huéspedes con estancia previa finalizada.

### 2. 🍽️ Punto de Venta (POS) & Comandas
* **Facturación con Catálogo ENUM:** Métodos de pago normalizados (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `CARGO_HABITACION`, `PLAN_HOTEL`).
* **Operador Autenticado:** Trazabilidad estricta asignando el usuario en sesión como responsable de la comanda (no editable por select).
* **Consumo Express Asistido:** Modal con selección obligatoria de momento de comida y plato con existencias reales.
* **Comprobante Interno Imprimible:** Recibo térmico configurable desde los datos institucionales del hotel y rotulado *"COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA"*.
* **Anulación de Comandas:** Anulación con motivo obligatorio para perfiles Gerente y Administrador, con reversión automática de stock e inventario.

### 3. 🛑 Control de Inventario Crítico (Sistema STOP)
* **Semáforo Dinámico Individual:** Evaluación basada en el `stock_minimo` configurado por cada producto:
  * 🟢 **Óptimo:** Stock superior a $2 \times \text{stock\_minimo}$.
  * 🟡 **Stock Bajo:** Stock entre $\text{stock\_minimo}$ y $2 \times \text{stock\_minimo}$.
  * 🔴 **STOP - CRÍTICO:** Stock inferior a $\text{stock\_minimo}$. Banner de alerta e impedimento de despacho si no hay existencias.
* **Reabastecimiento:** Módulo para surtir insumos y control de costos y precios de venta.

### 4. 💰 Flujo de Caja & Arqueo Diario
* **Separación Financiera Estricta:** El dinero físico y digital recaudado en caja no se contamina con los cargos a habitación (custodiados en folios como cuentas por cobrar).
* **Cierre de Caja con Arqueo:** Registro de efectivo físico contado, cálculo automático de diferencia (cuadrada, sobrante o faltante) e historial de actas de cierre.
* **Exportación CSV:** Protección contra inyección de fórmulas de hojas de cálculo (CSV Injection).

### 5. 🛡️ Mitigaciones de Prototipo en Cliente
* **Hashing con PBKDF2-SHA256:** WebCrypto API nativa con 310.000 iteraciones y sal aleatoria por usuario.
* **Control de Accesos (RBAC):** Matriz de permisos con 7 roles oficiales (`Administrador`, `Gerente`, `Cajero`, `Mesero`, `Recepción`, `Bodega`, `Auditor`).
* **Protección XSS y Delegación:** Eliminación de handlers `onclick` inline; delegación centralizada de eventos en DOM y codificación contextual.
* **Reautenticación:** Ventana modal accesible para autorizar operaciones destructivas (eliminar huésped, importar backup o restablecer).
* **Copias de Seguridad Todo-o-Nada:** Validación estricta estructural, de tipos, límites de tamaño (2 MB) y protección anti-prototype pollution con resguardo previo automático.

---

## 📚 Documentación Técnica y Manuales

* 👉 **[MANUAL_OPERATIVO.md](MANUAL_OPERATIVO.md):** Manual operativo diario detallado para los 7 roles del sistema (Recepción, Mesero, Cajero, Bodega, Gerente, Administrador y Auditor).
* 👉 **[DICCIONARIO_DATOS.md](DICCIONARIO_DATOS.md):** Diccionario relacional completo con tablas, campos, tipos, restricciones y llaves.
* 👉 **[SECURITY_KNOWN_LIMITATIONS.md](SECURITY_KNOWN_LIMITATIONS.md):** Matriz de seguridad y estado de mitigaciones AppSec (OWASP Top 10 / ASVS Level 2).
* 👉 **[CHANGELOG.md](CHANGELOG.md):** Registro histórico detallado de versiones y correcciones (B1 a B14).
* 👉 **[MIGRACION.md](MIGRACION.md):** Procedimiento de migración idempotente de esquemas de datos.

---

## 💻 Tecnologías Utilizadas

* **Backend:** Node.js 20 LTS, Microframework modular Express-compatible, Criptografía nativa (`crypto`, PBKDF2/Argon2 + Pepper de servidor), Cookies de sesión `HttpOnly; SameSite=Strict`, Middleware RBAC perimetral.
* **Persistencia Relacional:** MySQL 8.0 / MariaDB (Esquema v3.0 en `hotel_montserrat_db.sql`), Consultas 100% parametrizadas (anti SQLi), Transacciones atómicas ACID (`ejecutarTransaccion`) con Rollback automático.
* **Orquestación y Despliegue:** Docker Compose multi-contenedor con red privada aislada, volumen persistente, healthcheck de MySQL y Dockerfile multi-stage con usuario no-root.
* **Frontend:** HTML5 Semántico, CSS3 Moderno (Dark Mode Corporativo), Vanilla JavaScript (ES Modules nativos `import`/`export`), Cliente API REST centralizado (`apiClient.js`).
* **Lógica de Dominio:** Arquitectura desacoplada en `js/domain/` sin dependencias de DOM ni storage.
* **Suite de Pruebas:** Node.js Test Runner nativo (`node:test`, `node:assert/strict`) con 53 pruebas automatizadas pasando al 100%.

---

## 📦 Cómo Ejecutar el Proyecto y las Pruebas

### 1. Despliegue con Docker Compose (Producción / Local)
Levanta la base de datos MySQL 8.0 y el backend seguro en contenedores aislados:

```bash
docker-compose up -d --build
```

### 2. Servidor Backend Seguro (Modo Desarrollo)
Inicia el servidor HTTP / API REST localmente:

```bash
npm run server
# Servidor activo en http://localhost:4000
```

### 3. Interfaz Web (Frontend)
Abre `index.html` en cualquier navegador moderno mediante un servidor local:
```bash
npx serve .
```

### 4. Ejecución de Pruebas Automatizadas
Ejecuta la suite integral completa (frontend, backend, persistencia y QA) con un solo comando:

```bash
npm test
```

Para suites específicas:
```bash
# Pruebas unitarias de dominio y frontend
npm run test:frontend

# Pruebas de seguridad, base de datos y QA end-to-end
npm run test:backend
```

---

## 📁 Estructura del Proyecto

```text
Hotel-Montserrat-System/
├── index.html                   # Interfaz unificada con eventos delegados y modales
├── docker-compose.yml           # Orquestación MySQL 8.0 y Backend Node.js
├── Dockerfile                   # Imagen multi-stage de producción (usuario no-root)
├── package.json                 # Configuración de módulos ES y scripts npm test / server
├── README.md                    # Documentación oficial del sistema
├── MANUAL_OPERATIVO.md          # Manual de usuario para los 7 roles
├── DICCIONARIO_DATOS.md         # Diccionario de datos relacional de tablas y campos
├── SECURITY_KNOWN_LIMITATIONS.md# Registro de estado de mitigaciones AppSec
├── CHANGELOG.md                 # Registro histórico de versiones y correcciones
├── MIGRACION.md                 # Procedimiento de migración idempotente
├── hotel_montserrat_db.sql      # Esquema MySQL v3.0 normalizado con roles, ENUMs y auditoría
├── css/
│   └── styles.css               # Hoja de estilos con variables CSS y tema oscuro
├── js/
│   ├── app.js                   # Controlador de la aplicación y delegación de eventos
│   ├── apiClient.js             # Cliente HTTP REST centralizado con manejo de cookies
│   ├── seguridad.js             # RBAC, PBKDF2-SHA256, API bridge y ciclo de sesiones
│   ├── validaciones.js          # Sanitización segura, escape contextual y utilidades
│   └── domain/                  # Funciones puras de dominio independientes del DOM
│       ├── planes.js            # Lógica de asignación de cortesías y planes
│       ├── caja.js              # Clasificación de pagos ENUM y cálculo de caja
│       ├── inventario.js        # Semáforo dinámico de inventario STOP
│       ├── fechas.js            # Manejo de hora y fecha en America/Bogota (COT)
│       ├── backup.js            # Validación estricta todo-o-nada de copias de respaldo
│       └── migraciones.js       # Migración idempotente hacia esquema v3
├── backend/                     # Capa de Backend y API REST de Producción
│   ├── package.json             # Manifiesto del backend
│   ├── .env                     # Variables de entorno y secretos del servidor
│   ├── .env.example             # Plantilla de variables de entorno seguras
│   ├── src/
│   │   ├── server.js            # Punto de entrada del servidor HTTP
│   │   ├── app.js               # Mini-framework Express-compatible con límites de payload
│   │   ├── config/env.js        # Validación estricta de variables de entorno
│   │   ├── controllers/         # Controladores de autenticación y sesiones
│   │   ├── middlewares/         # Hardening (Helmet, CORS, Auth, RBAC deny-by-default, Errores)
│   │   ├── routes/              # Rutas protegidas /api/auth/* y /api/*
│   │   ├── db/                  # Gestor de conexión, pool transaccional y seeds
│   │   ├── repositories/        # Capa de acceso a datos 100% parametrizada
│   │   └── services/            # Lógica de negocio (Crypto, PMS, POS, STOP, Auditoría)
│   └── tests/
│       ├── security.test.js     # Pruebas de seguridad perimetral y criptografía
│       ├── database.test.js     # Pruebas de persistencia y transaccionalidad ACID
│       ├── pms_pos.test.js      # Pruebas de PMS hotelero, check-in/out y folios
│       └── integration_qa.test.js# Pruebas de flujos completos QA End-to-End
└── tests/                       # Suite de pruebas frontend
    └── phase0_real.test.js      # Pruebas de dominio, seguridad, adversarial y migración
```

---

## 🏢 Hotel Montserrat S.A.S.
**Sector:** Turismo, Hotelería y Gastronomía.  
Plataforma tecnológica para la administración de huéspedes, comandas, control de inventario crítico y facturación diaria.
