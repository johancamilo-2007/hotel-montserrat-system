-- =============================================================================
-- HOTEL MONTSERRAT S.A.S. - BASE DE DATOS RELACIONAL (MYSQL / MARIADB)
-- Sistema Integral de Gestión Hotelera, Inventario STOP y Restaurante POS
-- Versión del Esquema: 3.0 (Alineado con ES Modules y Arquitectura de Producción)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS hotel_montserrat_db 
    DEFAULT CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE hotel_montserrat_db;

-- -----------------------------------------------------------------------------
-- 0. TABLA DE VERSIONADO DE ESQUEMA (Bloque E / F-2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
    version INT PRIMARY KEY,
    fecha_migracion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    descripcion VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

INSERT INTO schema_version (version, descripcion) VALUES
(3, 'Esquema v3: 7 Roles RBAC homologados, ENUM de pagos oficial y arqueo de caja')
ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion);

-- -----------------------------------------------------------------------------
-- 1. TABLA DE CONFIGURACIÓN INSTITUCIONAL (Bloque D-4)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_hotel (
    id INT PRIMARY KEY DEFAULT 1,
    razon_social VARCHAR(120) NOT NULL DEFAULT 'Hotel Montserrat S.A.S.',
    nit VARCHAR(30) NULL COMMENT 'Asignado por la DIAN (NULL si no configurado)',
    direccion VARCHAR(120) NULL,
    telefono VARCHAR(40) NULL,
    regimen VARCHAR(80) NOT NULL DEFAULT 'Régimen Común / Ordinario',
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO configuracion_hotel (id, razon_social, nit, direccion, telefono) VALUES
(1, 'Hotel Montserrat S.A.S.', NULL, 'Carrera 7 # 12-45, Bogotá, Colombia', '(601) 345-6789')
ON DUPLICATE KEY UPDATE razon_social=VALUES(razon_social);

-- -----------------------------------------------------------------------------
-- 2. TABLA DE ROLES Y USUARIOS (SEGURIDAD RBAC - Bloque B-4 / F-2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
) ENGINE=InnoDB;

-- Homologación estricta con la constante ROLES de seguridad.js (7 roles oficiales)
INSERT INTO roles (id, nombre, descripcion) VALUES
(1, 'Administrador', 'Acceso total a módulos, configuración, auditoría y cierres'),
(2, 'Gerente', 'Supervisión operativa, anulación de comandas y reportes'),
(3, 'Cajero', 'Cobro de ventas, apertura y cierre oficial de caja con arqueo'),
(4, 'Mesero', 'Toma de comandas, servicio y consulta de inventario'),
(5, 'Recepción', 'Gestión de estancias, check-in, check-out y reinicio de comidas'),
(6, 'Bodega', 'Control de stock, creación de productos y toma física STOP'),
(7, 'Auditor', 'Consulta y auditoría de solo lectura sobre movimientos y caja')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), descripcion=VALUES(descripcion);

CREATE TABLE IF NOT EXISTS usuarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL COMMENT 'Hash seguro generado mediante Argon2id en Fase 1',
    salt VARCHAR(64) NOT NULL COMMENT 'Sal criptográfica aleatoria por usuario',
    nombre_completo VARCHAR(120) NOT NULL,
    rol_id INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- NOTA DE SEGURIDAD (Bloque F-2): Se eliminaron hashes falsos y credenciales de prueba
-- del script SQL. La provisión de usuarios iniciales debe ejecutarse únicamente
-- mediante script de semilla seguro fuera del repositorio público.

-- -----------------------------------------------------------------------------
-- 3. TABLA DE PLANES DE ALIMENTACIÓN
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planes_alimentacion (
    id INT PRIMARY KEY COMMENT '0: Solo Alojamiento, 1: Desayuno, 2: Media Pensión, 3: Pensión Completa',
    nombre VARCHAR(80) NOT NULL,
    comidas_diarias INT NOT NULL DEFAULT 0,
    descripcion VARCHAR(255)
) ENGINE=InnoDB;

INSERT INTO planes_alimentacion (id, nombre, comidas_diarias, descripcion) VALUES
(3, 'Pensión Completa', 3, 'Incluye 3 comidas diarias (Desayuno, Almuerzo y Cena)'),
(2, 'Media Pensión', 2, 'Incluye 2 comidas diarias a elección'),
(1, 'Alojamiento y Desayuno', 1, 'Incluye únicamente 1 desayuno buffet diario'),
(0, 'Solo Alojamiento', 0, 'Sin derechos de alimentación incluidos (consumos pagan tarifa estándar)')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- -----------------------------------------------------------------------------
-- 4. TABLA DE HABITACIONES, HUÉSPEDES Y ESTANCIAS (Fase 3 - Separación Persona/Estancia)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS habitaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(20) NOT NULL UNIQUE,
    tipo VARCHAR(50) NOT NULL DEFAULT 'Estándar',
    tarifa_noche DECIMAL(12,2) NOT NULL DEFAULT 150000.00,
    estado ENUM('Disponible', 'Ocupada', 'Mantenimiento') NOT NULL DEFAULT 'Disponible'
) ENGINE=InnoDB;

INSERT INTO habitaciones (numero, tipo, tarifa_noche, estado) VALUES
('101', 'Suite Andina', 280000.00, 'Disponible'),
('102', 'Doble Estándar', 180000.00, 'Disponible'),
('201', 'Superior Balcón', 220000.00, 'Disponible'),
('204', 'Doble Estándar', 180000.00, 'Disponible'),
('305', 'Individual Confort', 140000.00, 'Disponible')
ON DUPLICATE KEY UPDATE tipo=VALUES(tipo);

CREATE TABLE IF NOT EXISTS huespedes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    tipo_documento ENUM('CC', 'CE', 'PASAPORTE', 'NIT') NOT NULL DEFAULT 'CC',
    documento VARCHAR(50) NOT NULL COMMENT 'B8: Permite búsquedas y reingresos históricos',
    habitacion VARCHAR(20) NOT NULL,
    plan_id INT NOT NULL,
    comidas_hoy INT NOT NULL DEFAULT 0,
    estado ENUM('Activo', 'Check-out') DEFAULT 'Activo',
    fecha_checkin TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_checkout TIMESTAMP NULL,
    FOREIGN KEY (plan_id) REFERENCES planes_alimentacion(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_huespedes_habitacion ON huespedes(habitacion);
CREATE INDEX idx_huespedes_documento ON huespedes(documento);
CREATE INDEX idx_huespedes_estado ON huespedes(estado);

-- Estancias normalizadas (Separación formal de la persona respecto a cada visita)
CREATE TABLE IF NOT EXISTS estancias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    huesped_id BIGINT NOT NULL,
    habitacion_numero VARCHAR(20) NOT NULL,
    plan_id INT NOT NULL,
    comidas_hoy INT NOT NULL DEFAULT 0,
    total_folio DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cargos acumulados a habitación pendientes por liquidar',
    estado ENUM('Activa', 'Finalizada') NOT NULL DEFAULT 'Activa',
    fecha_checkin TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_checkout TIMESTAMP NULL,
    FOREIGN KEY (huesped_id) REFERENCES huespedes(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES planes_alimentacion(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_estancias_huesped ON estancias(huesped_id);
CREATE INDEX idx_estancias_estado ON estancias(estado);

-- -----------------------------------------------------------------------------
-- 5. TABLA DE INVENTARIO Y CATEGORÍAS (SISTEMA STOP - Bloque B9)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO categorias_inventario (id, nombre) VALUES
(1, 'Platos Fuertes'), (2, 'Carnes'), (3, 'Pescados'), (4, 'Aves'), (5, 'Desayunos'), (6, 'Bebidas'), (7, 'Postres')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

CREATE TABLE IF NOT EXISTS inventario (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    categoria_id INT,
    stock INT NOT NULL DEFAULT 0,
    stock_minimo INT NOT NULL DEFAULT 5 COMMENT 'B9: Umbral STOP individual por producto',
    unidad VARCHAR(30) NOT NULL DEFAULT 'Porción',
    costo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_inventario(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Trazabilidad de movimientos de inventario (Fase 3: Entradas, Salidas y Ajustes)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    inventario_id BIGINT NOT NULL,
    tipo ENUM('ENTRADA', 'SALIDA', 'AJUSTE', 'REVERSION') NOT NULL,
    cantidad INT NOT NULL,
    stock_previo INT NOT NULL,
    stock_posterior INT NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventario_id) REFERENCES inventario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_movimientos_inv ON movimientos_inventario(inventario_id);
CREATE INDEX idx_movimientos_tipo ON movimientos_inventario(tipo);

-- -----------------------------------------------------------------------------
-- 6. TABLA DE COMANDAS Y VENTAS (POS DE RESTAURANTE - Bloque D-1 / D-5 / Fase 3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comandas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    consecutivo INT NULL COMMENT 'Número consecutivo fiscal interno',
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    estancia_id BIGINT NULL,
    huesped_id BIGINT NULL,
    cliente_nombre VARCHAR(120) NOT NULL,
    habitacion VARCHAR(20) DEFAULT '',
    mesa VARCHAR(50) DEFAULT 'Mesa 1',
    mesero VARCHAR(100) NOT NULL,
    comida VARCHAR(50) NOT NULL COMMENT 'Desayuno, Almuerzo, Cena, Bebida',
    plato_nombre VARCHAR(120) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Fase 3: Snapshot de precio congelado al crear comanda',
    cantidad INT NOT NULL DEFAULT 1,
    tipo ENUM('Cortesía (Plan)', 'Cobro') NOT NULL,
    metodo_pago ENUM('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CARGO_HABITACION', 'PLAN_HOTEL') NOT NULL DEFAULT 'EFECTIVO',
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    anulada BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_anulacion VARCHAR(255) NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (estancia_id) REFERENCES estancias(id) ON DELETE SET NULL,
    FOREIGN KEY (huesped_id) REFERENCES huespedes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_comandas_fecha ON comandas(fecha);
CREATE INDEX idx_comandas_metodo_pago ON comandas(metodo_pago);
CREATE INDEX idx_comandas_anulada ON comandas(anulada);

-- -----------------------------------------------------------------------------
-- 7. TABLA DE CIERRES DE CAJA DIARIOS CON ARQUEO (Bloque D-3 / F-2)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cierres_caja (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    comandas_totales INT NOT NULL DEFAULT 0,
    total_caja DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Efectivo + Pagos Digitales liquidados',
    total_folios DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Cargos a habitación (Cuentas por cobrar)',
    efectivo_contado DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Arqueo físico reportado por el operador',
    diferencia DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'efectivo_contado - efectivo_esperado (Sobrante/Faltante)',
    motivo_reapertura VARCHAR(255) NULL COMMENT 'Obligatorio si se efectúa más de un cierre en la misma fecha',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_cierres_caja_fecha ON cierres_caja(fecha);

-- -----------------------------------------------------------------------------
-- 8. VISTA OPERATIVA: SEMÁFORO DE INVENTARIO CRÍTICO (SISTEMA STOP)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vista_alertas_stop AS
SELECT 
    i.id,
    i.uuid,
    i.nombre AS producto,
    c.nombre AS categoria,
    i.stock,
    i.stock_minimo,
    i.unidad,
    CASE 
        WHEN i.stock < i.stock_minimo THEN 'ALERTA STOP - CRÍTICO'
        WHEN i.stock <= i.stock_minimo * 2 THEN 'STOCK BAJO'
        ELSE 'ÓPTIMO'
    END AS estado_alerta
FROM inventario i
LEFT JOIN categorias_inventario c ON i.categoria_id = c.id
WHERE i.stock < i.stock_minimo;

-- -----------------------------------------------------------------------------
-- 9. TABLA DE AUDITORÍA FORENSE INMUTABLE (APPEND-ONLY - ASVS V8.2 / V8.3)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bitacora_auditoria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario VARCHAR(50) NOT NULL,
    rol VARCHAR(50) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255) NULL,
    evento VARCHAR(60) NOT NULL COMMENT 'LOGIN_SUCCESS, LOGIN_FAILED, BRUTE_FORCE_LOCKOUT, PERMISSION_DENIED, etc.',
    resultado ENUM('SUCCESS', 'FAILED', 'BLOCKED', 'DENIED') NOT NULL,
    recurso VARCHAR(120) NULL,
    detalles JSON NULL COMMENT 'Metadatos forenses estructurados de la operación',
    firma_integridad VARCHAR(64) NULL COMMENT 'Hash criptográfico encadenado para garantizar no repudio'
) ENGINE=InnoDB;

CREATE INDEX idx_auditoria_fecha ON bitacora_auditoria(fecha_hora);
CREATE INDEX idx_auditoria_usuario ON bitacora_auditoria(usuario);
CREATE INDEX idx_auditoria_evento ON bitacora_auditoria(evento);

