# 📖 Manual Operativo por Rol
## Hotel Montserrat S.A.S. — Sistema PMS Hotelero & POS Restaurante

Este manual describe los procedimientos operativos diarios para cada uno de los 7 roles autorizados en el sistema.

---

### 1. 🛎️ Rol: Recepción
* **Módulos asignados:** Huéspedes, Habitaciones, Estancias, Inventario (solo lectura).
* **Flujos principales:**
  * **Check-in de Huésped:**
    1. Dirígete a la pestaña **Huéspedes** y selecciona **Registrar Huésped**.
    2. Selecciona el tipo de documento (`CC`, `CE`, `PASAPORTE`, `NIT`) e ingresa el número.
    3. Selecciona una habitación disponible. El sistema no permite alojar en habitaciones ocupadas.
    4. Selecciona el Plan de Alimentación contratado (Pensión Completa, Media Pensión, Alojamiento y Desayuno o Solo Alojamiento).
    5. Confirma el check-in. La habitación pasa automáticamente a estado `Ocupada`.
  * **Check-out y Liquidación:**
    1. Ubica al huésped en la lista de estancias activas.
    2. Haz clic en **Check-out**. El sistema mostrará el folio con los cargos acumulados por consumos de restaurante.
    3. Selecciona el método de pago del folio (`Efectivo`, `Tarjeta` o `Transferencia`).
    4. Confirma la liquidación. La estancia finaliza, el estado del huésped pasa a `Check-out` y la habitación se libera a `Disponible`.
  * **Reinicio de Jornada:**
    * El sistema reinicia automáticamente los cupos diarios a la medianoche (hora de Bogotá). Si se requiere reinicio manual para un caso especial, se solicita autorización de Gerencia.

---

### 2. 🍽️ Rol: Mesero
* **Módulos asignados:** Comandas / POS, Inventario STOP (solo lectura).
* **Flujos principales:**
  * **Toma de Comandas a la Carta:**
    1. Ingresa a la sección **Comandas / POS**. El campo "Operador / Mesero" se asigna automáticamente a tu nombre de usuario.
    2. Selecciona si el cliente es un comensal general o un huésped alojado.
    3. Selecciona el plato y la cantidad solicitada.
    4. Si el huésped tiene plan con cortesías disponibles, el sistema aplicará automáticamente $0 a los cupos cubiertos y generará una línea de cobro para el excedente.
    5. Si el método de pago es `Cargar a Habitación`, el valor se cargará automáticamente al folio de la habitación para ser cobrado al check-out.
    6. Confirma la comanda. El stock se descuenta en tiempo real.
  * **Atención a Alertas STOP:**
    * Si un producto está en semáforo rojo (`STOP - CRÍTICO`), el sistema impedirá su venta si las existencias son insuficientes. No tomes pedidos de platos agotados.

---

### 3. 💰 Rol: Cajero
* **Módulos asignados:** Caja, Comandas, Inventario (consulta).
* **Flujos principales:**
  * **Cobro de Ventas:**
    1. Recibe el pago en Efectivo, Tarjeta (datafono) o Transferencia (código QR).
    2. Emite el comprobante interno térmico rotulado *"COMPROBANTE INTERNO - NO ES FACTURA ELECTRÓNICA"*.
  * **Cierre de Caja y Arqueo Diario:**
    1. Al finalizar el turno, dirígete al módulo **Flujo de Caja**.
    2. Realiza el conteo físico de los billetes y monedas en la gaveta.
    3. Digita el monto en el campo **Efectivo Físico Contado**.
    4. El sistema calculará automáticamente la diferencia (Cuadrada, Sobrante o Faltante) respecto al efectivo esperado.
    5. Ten en cuenta que los consumos con `Cargo a Habitación` figuran en el acta como **Folios por Cobrar** y no forman parte del efectivo de la caja del día.
    6. Guarda el acta oficial de cierre de caja. Una vez cerrada, queda bloqueada contra edición.

---

### 4. 📦 Rol: Bodega
* **Módulos asignados:** Inventario STOP, Reabastecimiento, Categorías.
* **Flujos principales:**
  * **Monitoreo de Existencias (Sistema STOP):**
    * 🟢 **Verde (Óptimo):** Stock $> 2 \times \text{stock\_minimo}$.
    * 🟡 **Amarillo (Bajo):** Stock entre $\text{stock\_minimo}$ y $2 \times \text{stock\_minimo}$.
    * 🔴 **Rojo (STOP):** Stock $< \text{stock\_minimo}$. Prioridad alta de compra.
  * **Surtido de Mercancía:**
    1. Selecciona el producto a surtir.
    2. Digita la cantidad de unidades que ingresan.
    3. Ingresa obligatoriamente el motivo del movimiento (número de factura de compra o remisión del proveedor).
    4. Confirma el ajuste. El movimiento queda registrado de forma inmutable con fecha, hora y tu nombre de usuario.

---

### 5. 👔 Rol: Gerente
* **Módulos asignados:** Todos los módulos operativos, Supervisión y Reportes.
* **Atribuciones especiales:**
  * **Anulación de Comandas:** Requiere justificación detallada (mínimo 5 caracteres). Al anular, el sistema restituye automáticamente el stock y registra la anulación para auditoría.
  * **Reapertura de Caja:** En caso de discrepancias mayores justificadas, autoriza la reapertura registrando el motivo en el sistema.
  * **Exportación de Reportes Financieros:** Descarga de reportes en CSV con protección activa contra inyección de fórmulas.

---

### 6. ⚙️ Rol: Administrador
* **Módulos asignados:** Acceso Total a nivel de sistema.
* **Atribuciones exclusivas:**
  * Gestión de usuarios, cambio de contraseñas de alta complejidad (>= 12 caracteres).
  * Configuración institucional del hotel (NIT, Razón Social, Régimen fiscal, Dirección).
  * Consulta de la bitácora de auditoría forense inmutable.
  * Importación y exportación de copias de respaldo con validación todo-o-nada.
  * Restablecimiento seguro del sistema a parámetros iniciales.

---

### 7. 🔍 Rol: Auditor
* **Módulos asignados:** Acceso de Solo Lectura a Caja, Comandas, Inventario y Reportes.
* **Atribuciones:**
  * Inspección de actas de arqueo de caja e historial de diferencias.
  * Revisión de comandas anuladas y motivos registrados.
  * Trazabilidad de entradas y salidas de bodega.
  * Descarga de reportes analíticos para revisoría fiscal y contabilidad.
