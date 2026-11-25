# 🗄️ Diccionario de Datos Relacional
## Hotel Montserrat S.A.S. — Esquema de Base de Datos v3.0

Motor: **MySQL 8.0 / MariaDB**  
Codificación: `utf8mb4` | Collation: `utf8mb4_unicode_ci`  
Esquema formal: [hotel_montserrat_db.sql](hotel_montserrat_db.sql)

---

### 1. Tabla: `schema_version`
Control de versiones y migraciones idempotentes de la base de datos.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `version` | `INT` | NO | PK | — | Número entero de la versión aplicada (Ej: 3). |
| `fecha_migracion` | `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Fecha y hora en que se ejecutó la migración. |
| `descripcion` | `VARCHAR(255)` | NO | — | — | Detalle descriptivo de los cambios del esquema. |

---

### 2. Tabla: `configuracion_hotel`
Datos institucionales para emisión de comprobantes internos y parametrización tributaria.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `INT` | NO | PK | `1` | Identificador único del registro de configuración. |
| `razon_social` | `VARCHAR(120)` | NO | — | `'Hotel Montserrat S.A.S.'` | Razón social institucional registrada. |
| `nit` | `VARCHAR(30)` | SÍ | — | `NULL` | NIT expedido por la DIAN (validar con contador). |
| `direccion` | `VARCHAR(120)` | SÍ | — | — | Dirección física del establecimiento. |
| `telefono` | `VARCHAR(40)` | SÍ | — | — | Teléfono de contacto / PBX. |
| `regimen` | `VARCHAR(80)` | NO | — | `'Régimen Ordinario'` | Clasificación tributaria del establecimiento. |
| `fecha_actualizacion`| `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Última actualización de datos. |

---

### 3. Tabla: `roles`
Catálogo oficial de perfiles de usuario del sistema (RBAC).

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `INT` | NO | PK | AI | Identificador único del rol. |
| `nombre` | `VARCHAR(50)` | NO | UQ | — | Nombre del rol (`Administrador`, `Gerente`, `Cajero`, `Mesero`, `Recepción`, `Bodega`, `Auditor`). |
| `descripcion` | `VARCHAR(255)` | SÍ | — | — | Alcance y permisos asociados al perfil. |

---

### 4. Tabla: `usuarios`
Cuentas de usuario protegidas con hashes criptográficos.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único de usuario. |
| `usuario` | `VARCHAR(50)` | NO | UQ | — | Identificador de inicio de sesión en minúsculas. |
| `password_hash` | `VARCHAR(255)` | NO | — | — | Hash derivado mediante Argon2id / PBKDF2 + Pepper. |
| `salt` | `VARCHAR(64)` | NO | — | — | Sal criptográfica aleatoria individual de 32 bytes hex. |
| `nombre_completo` | `VARCHAR(120)` | NO | — | — | Nombre y apellidos del colaborador. |
| `rol_id` | `INT` | NO | FK | — | Referencia al rol en `roles(id)`. |
| `activo` | `BOOLEAN` | NO | — | `TRUE` | Estado de la cuenta (permite deshabilitar sin borrar). |
| `fecha_creacion` | `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Fecha y hora de alta en el sistema. |

---

### 5. Tabla: `habitaciones`
Catálogo de habitaciones del hotel y estado de ocupación en tiempo real.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `INT` | NO | PK | AI | Identificador interno de habitación. |
| `numero` | `VARCHAR(20)` | NO | UQ | — | Número o código de habitación (Ej: '101', '201'). |
| `tipo` | `VARCHAR(50)` | NO | — | `'Estándar'` | Categoría de la habitación (Suite, Balcón, etc.). |
| `tarifa_noche` | `DECIMAL(12,2)` | NO | — | `150000.00` | Tarifa base por noche de alojamiento en COP. |
| `estado` | `ENUM` | NO | — | `'Disponible'` | Estado actual: `'Disponible'`, `'Ocupada'`, `'Mantenimiento'`. |

---

### 6. Tabla: `planes_alimentacion`
Catálogo de planes contratados y derechos diarios de alimentación.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `INT` | NO | PK | — | Código del plan (0: Solo Alojamiento, 1: Desayuno, 2: Media Pensión, 3: Pensión Completa). |
| `nombre` | `VARCHAR(80)` | NO | — | — | Nombre descriptivo del plan. |
| `comidas_diarias` | `INT` | NO | — | `0` | Cantidad de comidas de cortesía diarias asignadas. |
| `descripcion` | `VARCHAR(255)` | SÍ | — | — | Descripción detallada de coberturas del plan. |

---

### 7. Tabla: `huespedes`
Registro maestro de personas / huéspedes (identidad permanente).

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único de la persona. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4 público. |
| `nombre` | `VARCHAR(120)` | NO | — | — | Nombre completo del huésped. |
| `tipo_documento` | `ENUM` | NO | — | `'CC'` | Tipo de documento: `'CC'`, `'CE'`, `'PASAPORTE'`, `'NIT'`. |
| `documento` | `VARCHAR(50)` | NO | — | — | Número de documento (sin UNIQUE para reingresos). |
| `habitacion` | `VARCHAR(20)` | NO | — | — | Última habitación asignada. |
| `plan_id` | `INT` | NO | FK | — | Referencia al plan en `planes_alimentacion(id)`. |
| `comidas_hoy` | `INT` | NO | — | `0` | Contador de comidas consumidas en el día actual. |
| `estado` | `ENUM` | NO | — | `'Activo'` | Estado de la estancia: `'Activo'`, `'Check-out'`. |
| `fecha_checkin` | `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Fecha y hora de ingreso. |
| `fecha_checkout` | `TIMESTAMP` | SÍ | — | `NULL` | Fecha y hora de salida. |

---

### 8. Tabla: `estancias`
Registro formal de cada visita de alojamiento (relación N:1 con `huespedes`).

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único de estancia. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4 de la estancia. |
| `huesped_id` | `BIGINT` | NO | FK | — | Referencia al huésped en `huespedes(id)`. |
| `habitacion_numero`| `VARCHAR(20)`| NO | — | — | Número de la habitación asignada. |
| `plan_id` | `INT` | NO | FK | — | Plan contratado durante esta visita. |
| `comidas_hoy` | `INT` | NO | — | `0` | Contador de comidas del día. |
| `total_folio` | `DECIMAL(12,2)` | NO | — | `0.00` | Monto acumulado pendiente por liquidar en check-out. |
| `estado` | `ENUM` | NO | — | `'Activa'` | Estado de la estancia: `'Activa'`, `'Finalizada'`. |
| `fecha_checkin` | `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Inicio del alojamiento. |
| `fecha_checkout` | `TIMESTAMP` | SÍ | — | `NULL` | Cierre del alojamiento. |

---

### 9. Tabla: `inventario`
Catálogo de insumos y platos con umbrales del Sistema STOP.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único del producto. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4. |
| `nombre` | `VARCHAR(120)` | NO | — | — | Nombre comercial del plato o insumo. |
| `categoria_id` | `INT` | SÍ | FK | `NULL` | Referencia a `categorias_inventario(id)`. |
| `stock` | `INT` | NO | — | `0` | Existencias actuales disponibles. |
| `stock_minimo` | `INT` | NO | — | `5` | Umbral crítico individual para semáforo STOP. |
| `unidad` | `VARCHAR(30)` | NO | — | `'Porción'` | Unidad de medida (Porción, Vaso, Taza, etc.). |
| `costo_unitario`| `DECIMAL(12,2)`| NO | — | `0.00` | Costo de adquisición o preparación en COP. |
| `precio_venta` | `DECIMAL(12,2)`| NO | — | `0.00` | Precio de venta al público en COP. |

---

### 10. Tabla: `movimientos_inventario`
Bitácora inmutable de trazabilidad de entradas, salidas y ajustes de stock.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único del movimiento. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4 del movimiento. |
| `inventario_id` | `BIGINT` | NO | FK | — | Referencia al producto en `inventario(id)`. |
| `tipo` | `ENUM` | NO | — | — | `'ENTRADA'`, `'SALIDA'`, `'AJUSTE'`, `'REVERSION'`. |
| `cantidad` | `INT` | NO | — | — | Cantidad absoluta de unidades modificadas. |
| `stock_previo` | `INT` | NO | — | — | Stock antes de la operación. |
| `stock_posterior`| `INT` | NO | — | — | Stock resultante tras la operación. |
| `motivo` | `VARCHAR(255)` | NO | — | — | Justificación obligatoria del movimiento. |
| `usuario_responsable`| `VARCHAR(100)`| NO | — | — | Nombre del operador que realizó la acción. |
| `fecha_registro`| `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Fecha y hora del movimiento. |

---

### 11. Tabla: `comandas`
Registro de órdenes y consumos del restaurante / POS.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador interno de comanda. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4. |
| `consecutivo` | `INT` | SÍ | — | `NULL` | Consecutivo numérico para comprobante térmico. |
| `fecha` | `DATE` | NO | — | — | Fecha de emisión (YYYY-MM-DD en hora Bogotá). |
| `hora` | `TIME` | NO | — | — | Hora de emisión (HH:MM:SS en hora Bogotá). |
| `estancia_id` | `BIGINT` | SÍ | FK | `NULL` | Referencia a `estancias(id)` si es consumo de huésped. |
| `huesped_id` | `BIGINT` | SÍ | FK | `NULL` | Referencia a `huespedes(id)`. |
| `cliente_nombre`| `VARCHAR(120)` | NO | — | — | Nombre del cliente o consumidor final. |
| `habitacion` | `VARCHAR(20)` | SÍ | — | `''` | Habitación asociada si aplica. |
| `mesa` | `VARCHAR(50)` | SÍ | — | `'Mesa 1'` | Mesa o zona de despacho del restaurante. |
| `mesero` | `VARCHAR(100)` | NO | — | — | Operador autenticado responsable de la comanda (B-5). |
| `comida` | `VARCHAR(50)` | NO | — | — | Momento de consumo (Desayuno, Almuerzo, Cena). |
| `plato_nombre` | `VARCHAR(120)` | NO | — | — | Descripción del producto ordenado. |
| `precio_unitario`| `DECIMAL(12,2)`| NO | — | `0.00` | Precio unitario congelado al momento del pedido. |
| `cantidad` | `INT` | NO | — | `1` | Cantidad de porciones. |
| `tipo` | `ENUM` | NO | — | — | `'Cortesía (Plan)'` o `'Cobro'`. |
| `metodo_pago` | `ENUM` | NO | — | `'EFECTIVO'`| ENUM: `EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `CARGO_HABITACION`, `PLAN_HOTEL`. |
| `total` | `DECIMAL(12,2)` | NO | — | `0.00` | Valor total a pagar en COP ($0 si es cortesía). |
| `anulada` | `BOOLEAN` | NO | — | `FALSE` | Marca lógica de anulación. |
| `motivo_anulacion`| `VARCHAR(255)`| SÍ | — | `NULL` | Justificación registrada de anulación. |

---

### 12. Tabla: `cierres_caja`
Actas oficiales e históricas de arqueo físico y cierre diario.

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único de cierre. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4 del acta. |
| `fecha` | `DATE` | NO | — | — | Fecha oficial del cierre (hora Bogotá). |
| `hora` | `TIME` | NO | — | — | Hora de registro del cierre. |
| `usuario_responsable`| `VARCHAR(100)`| NO | — | — | Cajero o gerente que efectúa el arqueo. |
| `comandas_totales`| `INT` | NO | — | `0` | Cantidad de comandas procesadas en la jornada. |
| `total_caja` | `DECIMAL(14,2)`| NO | — | `0.00` | Total recaudado en efectivo y digital. |
| `total_folios` | `DECIMAL(14,2)`| NO | — | `0.00` | Cuentas por cobrar acumuladas en folios. |
| `efectivo_contado`| `DECIMAL(14,2)`| NO | — | `0.00` | Dinero físico contado en gaveta por el operador. |
| `diferencia` | `DECIMAL(14,2)`| NO | — | `0.00` | Diferencia contable (`efectivo_contado` - `efectivo_esperado`). |
| `motivo_reapertura`| `VARCHAR(255)`| SÍ | — | `NULL` | Motivo de reapertura autorizado por Gerencia. |

---

### 13. Tabla: `bitacora_auditoria`
Registro forense inmutable de seguridad (Append-Only).

| Campo | Tipo | Nulo | Clave | Default | Descripción |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `id` | `BIGINT` | NO | PK | AI | Identificador único secuencial. |
| `uuid` | `VARCHAR(64)` | NO | UQ | — | Identificador UUID v4 del evento. |
| `fecha_hora` | `TIMESTAMP` | NO | — | `CURRENT_TIMESTAMP` | Timestamp ISO UTC del suceso. |
| `usuario` | `VARCHAR(50)` | NO | — | — | Usuario que ejecutó o intentó la acción. |
| `rol` | `VARCHAR(50)` | NO | — | — | Rol del usuario al momento de la acción. |
| `ip` | `VARCHAR(45)` | NO | — | — | Dirección IP de origen (IPv4 o IPv6). |
| `user_agent` | `VARCHAR(255)` | SÍ | — | `NULL` | Navegador o cliente HTTP utilizado. |
| `evento` | `VARCHAR(60)` | NO | — | — | Código del evento (`LOGIN_SUCCESS`, `BRUTE_FORCE_LOCKOUT`, `DESTRUCTIVE_ACTION`, etc.). |
| `resultado` | `ENUM` | NO | — | — | `'SUCCESS'`, `'FAILED'`, `'BLOCKED'`, `'DENIED'`. |
| `recurso` | `VARCHAR(120)` | SÍ | — | `NULL` | Ruta o endpoint accedido. |
| `detalles` | `JSON` | SÍ | — | `NULL` | Metadatos y contexto forense estructurado. |
| `firma_integridad`| `VARCHAR(64)` | SÍ | — | `NULL` | Hash SHA-256 encadenado para garantizar no repudio. |
