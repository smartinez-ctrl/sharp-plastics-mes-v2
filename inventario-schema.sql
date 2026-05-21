-- ════════════════════════════════════════════════════════════════
-- INVENTARIO — Schema completo
-- ════════════════════════════════════════════════════════════════
-- Ejecutar en orden. Idempotente con IF NOT EXISTS donde aplica.

-- 1) CATÁLOGO DE PRODUCTOS
-- Productos físicos del inventario. Lista cerrada de tipos pero
-- pueden agregarse colores/variantes nuevos en cualquier momento.
CREATE TABLE IF NOT EXISTS inventario_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,           -- 'Botella 600ml', 'Tapa', 'Liner'...
  categoria TEXT NOT NULL,               -- 'botella', 'tapa', 'chupon', 'liner', 'papel', 'liga', 'tag', 'corrugado'
  capacidad INT,                         -- 500, 600, 700 (solo para botellas y corrugado)
  tiene_variantes BOOLEAN DEFAULT false, -- true para botella/tapa/chupon
  unidad TEXT DEFAULT 'pieza',
  -- Mapeo automático de consumo al cerrar pedido:
  --  - 'botella': descuenta por (buenas + merma) con match por capacidad+color
  --  - 'tapa', 'chupon': descuenta por buenas con match por color
  --  - 'liner', 'papel', 'liga', 'tag': descuenta por buenas (sin color)
  --  - 'corrugado': NO descuenta automático
  consumo_automatico BOOLEAN DEFAULT true,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) VARIANTES (colores) de los productos que tienen variantes
CREATE TABLE IF NOT EXISTS inventario_variantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES inventario_productos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,                  -- 'Green Plant Party', 'Black Eastside', 'Clear', etc.
  pantone TEXT,                          -- código PMS opcional para matching más preciso
  minimo_reserva INT DEFAULT 0,          -- 1500 default para botellas, configurable después
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, nombre)
);

-- 3) STOCK actual por producto/variante/ubicación
-- Dos filas por cada producto/variante: una para 'almacen', otra para 'produccion'
CREATE TABLE IF NOT EXISTS inventario_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES inventario_productos(id) ON DELETE CASCADE,
  variante_id UUID REFERENCES inventario_variantes(id) ON DELETE CASCADE, -- NULL si producto no tiene variantes
  ubicacion TEXT NOT NULL CHECK (ubicacion IN ('almacen', 'produccion')),
  cantidad NUMERIC NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(producto_id, variante_id, ubicacion)
);

-- 4) MOVIMIENTOS: auditoría completa de toda operación
-- Cada entrada/traspaso/consumo/salida queda registrado aquí
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'traspaso_a_produccion', 'traspaso_a_almacen', 'consumo_pedido', 'salida_manual', 'ajuste')),
  producto_id UUID NOT NULL REFERENCES inventario_productos(id),
  variante_id UUID REFERENCES inventario_variantes(id),
  cantidad NUMERIC NOT NULL,
  ubicacion_origen TEXT CHECK (ubicacion_origen IN ('almacen', 'produccion', 'externo')),
  ubicacion_destino TEXT CHECK (ubicacion_destino IN ('almacen', 'produccion', 'consumido')),
  -- Solo para entradas: fecha de producción del lote y número de lote
  lote_fecha DATE,
  lote_numero TEXT,
  -- Solo para consumo_pedido: referencia al pedido
  orden_id UUID REFERENCES ordenes_produccion(id),
  pipeline_id UUID REFERENCES pipeline_mf(id),
  usuario TEXT,                          -- quién hizo el movimiento (nombre del usuario)
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar updated_at en stock cuando hay cambios
CREATE OR REPLACE FUNCTION inv_stock_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_stock_updated_at ON inventario_stock;
CREATE TRIGGER trg_inv_stock_updated_at
  BEFORE UPDATE ON inventario_stock
  FOR EACH ROW EXECUTE FUNCTION inv_stock_touch();

-- ════════════════════════════════════════════════════════════════
-- POBLAR CATÁLOGO INICIAL
-- ════════════════════════════════════════════════════════════════

INSERT INTO inventario_productos (nombre, categoria, capacidad, tiene_variantes, consumo_automatico) VALUES
  ('Botella 500ml', 'botella', 500, true, true),
  ('Botella 600ml', 'botella', 600, true, true),
  ('Botella 700ml', 'botella', 700, true, true),
  ('Tapa', 'tapa', NULL, true, true),
  ('Chupon', 'chupon', NULL, true, true),
  ('Liner', 'liner', NULL, false, true),
  ('Papel empaque', 'papel', NULL, false, true),
  ('Liga', 'liga', NULL, false, true),
  ('Tag', 'tag', NULL, false, true),
  ('Corrugado 700ml/100pzas', 'corrugado', 700, false, false),
  ('Corrugado 700ml/50pzas',  'corrugado', 700, false, false),
  ('Corrugado 600ml/100pzas', 'corrugado', 600, false, false),
  ('Corrugado 600ml/50pzas',  'corrugado', 600, false, false)
ON CONFLICT (nombre) DO NOTHING;

-- Stock inicial vacío para productos SIN variantes (uno por ubicación)
INSERT INTO inventario_stock (producto_id, variante_id, ubicacion, cantidad)
SELECT p.id, NULL, ub, 0
FROM inventario_productos p
CROSS JOIN (VALUES ('almacen'), ('produccion')) AS u(ub)
WHERE p.tiene_variantes = false
ON CONFLICT (producto_id, variante_id, ubicacion) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- ROLES NUEVOS PARA USUARIOS
-- ════════════════════════════════════════════════════════════════
-- Si la tabla usuarios tiene CHECK constraint en rol, ampliarlo.
-- Si no lo tiene, este paso es no-op.
DO $$
BEGIN
  -- Quitar constraint viejo si existe
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
  END IF;
END $$;

-- Recrear con los nuevos roles incluidos
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('master', 'supervisor', 'operador', 'facturacion', 'almacen', 'produccion'));

-- ════════════════════════════════════════════════════════════════
-- VERIFICAR
-- ════════════════════════════════════════════════════════════════
SELECT 'productos' AS tabla, COUNT(*) FROM inventario_productos
UNION ALL SELECT 'variantes', COUNT(*) FROM inventario_variantes
UNION ALL SELECT 'stock', COUNT(*) FROM inventario_stock
UNION ALL SELECT 'movimientos', COUNT(*) FROM inventario_movimientos;
