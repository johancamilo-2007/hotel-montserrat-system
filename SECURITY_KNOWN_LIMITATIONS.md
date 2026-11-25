# ⚠️ Registro de Seguridad y Estado de Mitigaciones (AppSec Matrix)
## Hotel Montserrat S.A.S. — Estado: Fase 2 (Persistencia MySQL 8.0, Transacciones ACID y Docker Compose)

> [!NOTE]
> **ESTADO TRAS COMPLETAR FASE 2:**  
> Se implementó la capa de persistencia relacional con consultas 100% parametrizadas (anti SQL Injection ASVS V5.3), transacciones atómicas ACID con soporte de Rollback automático ante fallos (`ejecutarTransaccion`), repositorios de dominio dedicados, contenedorización con Docker Compose para MySQL 8.0 y scripts de semilla con hashes seguros.

---

### 📋 Matriz de Estado de Seguridad (Fase 0 vs. Fase 1 vs. Fase 2)

| ID | Área Técnica | Fase 0 (Prototipo Cliente) | Fase 1 (Backend AppSec) | Fase 2 (Persistencia & ACID) | Implementación Verificada |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **KL-01** | **Gestión de Sesiones** | REQUIERE FASE 1 | **CERRADO EN SERVIDOR** | **CERRADO** | Sesiones en servidor con tokens de 256 bits, rotación anti-fijación, cookies `HttpOnly; SameSite=Strict`, expiración dual (20m/12h). |
| **KL-02** | **Protección de Credenciales** | MITIGADO (PBKDF2 cliente) | **CERRADO EN SERVIDOR** | **CERRADO** | Hashing con sal individual y pepper de servidor. Semillas seguras generadas en `backend/src/db/seed.js`. |
| **KL-03** | **Datos en Reposo** | REQUIERE FASE 1 (localStorage) | EN PROCESO | **CERRADO** | Esquema relacional MySQL 8.0 normalizado (`hotel_montserrat_db.sql`), volumen persistente en Docker Compose y repositorios parametrizados. |
| **KL-04** | **Control de Acceso (RBAC)** | MITIGADO (Cosmético) | **CERRADO EN SERVIDOR** | **CERRADO** | Middleware `requerirPermiso()` deny-by-default y atribución inviolable del operador en comanda (B-5). |
| **KL-05** | **Concurrencia y Transacciones** | REQUIERE FASE 1 | EN PROCESO | **CERRADO** | Gestor de transacciones ACID (`ejecutarTransaccion`) con descuento atómico de inventario, actualización de cupos y rollback garantizado en error. |
| **KL-06** | **Anti Fuerza Bruta** | MITIGADO (Cliente) | **CERRADO EN SERVIDOR** | **CERRADO** | Backoff progresivo por IP y usuario (30s → 1m → 5m → 15m; HTTP 429). |
| **KL-07** | **Hardening de Transporte** | INEXISTENTE | **CERRADO EN SERVIDOR** | **CERRADO** | CSP estricta, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, CORS delimitado. |
| **KL-08** | **Auditoría Forense** | INEXISTENTE | **CERRADO EN SERVIDOR** | **CERRADO** | Tabla `bitacora_auditoria` append-only en MySQL y servicio de registro inmutable forense. |

---

### 🛡️ Declaración de Honestidad Técnica
- **CERRADO EN SERVIDOR Y BASE DE DATOS:** Control de accesos perimetral, gestión de sesiones seguras, consultas parametrizadas anti-SQLi, transaccionalidad ACID atómica, anulación con reversión de inventario y arqueo físico de caja persistido.
- **PRÓXIMO PASO (FASE 3):** Lógica avanzada de PMS hotelero (gestión de folios consolidados, tarifas por temporada y transferencias entre cuentas).
