# 🔄 Guía de Migración de Datos (MIGRACION.md)
## Hotel Montserrat S.A.S. — Esquema de Persistencia v3.0

Este documento describe la estrategia y los procedimientos técnicos de migración de datos para garantizar la continuidad operativa del sistema desde prototipos anteriores hacia el estándar de producción.

---

### 🎯 1. Estrategia de Migración Idempotente

La función pura `migrar(db)` ubicada en [js/domain/migraciones.js](file:///c:/Users/JEIMAR/OneDrive/Documentos/Andino-Restaurant-System/js/domain/migraciones.js) implementa un algoritmo de transformación **100 % idempotente**:

$$\text{migrar}(\text{migrar}(db)) \equiv \text{migrar}(db)$$

Ejecutar la migración una, dos o múltiples veces sobre la misma fuente de datos produce exactamente la misma estructura de base de datos normalizada v3, sin alterar identificadores ni duplicar registros.

---

### 📋 2. Cambios de Esquema (v1/v2 → v3)

| Entidad / Campo | Estado en v1 / v2 | Estado en v3 (Producción) | Regla de Transformación |
| :--- | :--- | :--- | :--- |
| **Llaves de Almacenamiento** | `hotelAndino_DB_v2`, `hotelAndino_DB` | `hotelMontserrat_DB_v2` | `migrarDatosLegacy()` lee la clave antigua, la procesa mediante `migrar()` y `validarBackup()`, la almacena en la clave nueva y elimina permanentemente las claves legacy. |
| **Identificadores (IDs)** | Números o cadenas (`1`, `2`, `c101`) | Cadenas de texto alfanuméricas estandarizadas (`id`) | Se convierte todo ID a string garantizando que las referencias foráneas (`comandas.idHuesped`) preserven la integridad relacional. |
| **Métodos de Pago** | Texto libre (`Efectivo`, `Cargar a Habitación`, `Plan`) | Catálogo ENUM estricto (`EFECTIVO`, `TARJETA`, `TRANSFERENCIA`, `CARGO_HABITACION`, `PLAN_HOTEL`) | `clasificarPago(metodo)` mapea automáticamente variantes históricas al ENUM correspondiente. |
| **Cierres de Caja** | Campo único `total`, sin arqueo | `totalCaja`, `totalFolios`, `efectivoContado`, `diferencia` | Se mapea `total` a `totalCaja`; se inicializa `totalFolios = 0`; se calcula la diferencia de arqueo físico. |
| **Inventario (STOP)** | Umbral implícito fijo en 5 | Campo `stock_minimo` explícito por producto | Si no existe `stock_minimo`, se asigna por defecto el valor `5`. |
| **Configuración Institucional** | Inexistente (hardcoded en UI) | Objeto `config` en raíz del JSON | Se crea con razón social `Hotel Montserrat S.A.S.` y campos para NIT, dirección y teléfono. |
| **Versión de Esquema** | Implícita o no definida | `schemaVersion = 3` | Permite a `validarBackup()` verificar compatibilidad estructural inmediata. |

---

### 🛡️ 3. Política de Validación "Todo o Nada"

Antes de persistir cualquier dato migrado o importado desde archivo JSON, interviene `validarBackup(obj)`:
1. **Límite de Tamaño:** Máximo 2 MB por archivo.
2. **Protección Anti-Prototype Pollution:** Se rechazan objetos con claves `__proto__`, `constructor` o `prototype`.
3. **Claves Permitidas en Raíz:** Solo se admiten `schemaVersion`, `huespedes`, `inventario`, `comandas`, `cierresCaja`, `ultimoDiaOperativo` y `config`.
4. **Integridad Referencial:** Cada comanda con `idHuesped` debe coincidir con un ID existente en la colección `huespedes`.
5. Si ocurre un solo error, **la importación se aborta en su totalidad**, dejando intacto el estado previo.
