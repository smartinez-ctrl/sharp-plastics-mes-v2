-- ============================================================
-- Sharp Plastics MES v2 — Schema
-- ============================================================

-- USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('master','facturacion','supervisor','operador')),
  pin TEXT NOT NULL,
  color TEXT DEFAULT '#8890a4',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PIPELINE (pedidos desde gestión)
CREATE TABLE IF NOT EXISTS pipeline_mf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente TEXT NOT NULL,
  sub_cliente TEXT,
  po TEXT NOT NULL,
  talla INTEGER,
  piezas INTEGER DEFAULT 0,
  colores INTEGER DEFAULT 0,
  tintas_info JSONB DEFAULT '[]',
  fecha_entrega DATE,
  estado TEXT DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente','En producción','Completado','Entregado','Cancelado')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ORDENES DE PRODUCCIÓN
CREATE TABLE IF NOT EXISTS ordenes_produccion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  op TEXT NOT NULL,
  cliente TEXT,
  producto TEXT,
  piezas_total INTEGER DEFAULT 0,
  lote_botella TEXT,
  lote_tapa TEXT,
  maquina TEXT DEFAULT 'Shuttle',
  colores JSONB DEFAULT '[]',
  ajustadores JSONB DEFAULT '[]',
  operadores JSONB DEFAULT '[]',
  estado TEXT DEFAULT 'ajuste',
  tiempo_ajuste_seg INTEGER DEFAULT 0,
  tiempo_produccion_seg INTEGER DEFAULT 0,
  piezas_buenas INTEGER DEFAULT 0,
  merma_ajuste JSONB DEFAULT '{}',
  merma_produccion JSONB DEFAULT '{}',
  tintas JSONB DEFAULT '[]',
  qa_resultados JSONB DEFAULT '{}',
  reajustes INTEGER DEFAULT 0,
  uv_intensidad INTEGER,
  uv_velocidad INTEGER,
  proceso_alcohol BOOLEAN DEFAULT false,
  proceso_primer BOOLEAN DEFAULT false,
  crosshatch TEXT,
  prueba_agua TEXT,
  pipeline_id UUID REFERENCES pipeline_mf(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_pipeline_estado ON pipeline_mf(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes_produccion(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_op ON ordenes_produccion(op);

-- RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_mf ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenes_produccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_usuarios" ON usuarios FOR ALL USING (true);
CREATE POLICY "anon_all_pipeline" ON pipeline_mf FOR ALL USING (true);
CREATE POLICY "anon_all_ordenes" ON ordenes_produccion FOR ALL USING (true);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_mf TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordenes_produccion TO anon;

-- DATOS INICIALES
INSERT INTO usuarios (nombre, rol, pin, color) VALUES
  ('Edgar',       'supervisor',  '0000', '#f5a623'),
  ('Eduardo',     'supervisor',  '0000', '#fb923c'),
  ('Bety',        'operador',    '0000', '#34d399'),
  ('Dulce',       'operador',    '0000', '#a78bfa'),
  ('Master',      'master',      '0000', '#00e5a0'),
  ('Facturación', 'facturacion', '0000', '#3d8eff')
ON CONFLICT DO NOTHING;
