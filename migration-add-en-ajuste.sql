-- Migración: agregar 'En ajuste' como valor válido para pipeline_mf.estado
-- Correr esto en el SQL Editor de Supabase

-- 1) Eliminar el constraint viejo (su nombre lo asigna Postgres automáticamente,
--    típicamente pipeline_mf_estado_check). Buscamos el constraint check de la columna estado:
ALTER TABLE pipeline_mf DROP CONSTRAINT IF EXISTS pipeline_mf_estado_check;

-- 2) Agregar el nuevo constraint con 'En ajuste' incluido
ALTER TABLE pipeline_mf
  ADD CONSTRAINT pipeline_mf_estado_check
  CHECK (estado IN ('Pendiente','En ajuste','En producción','Completado','Entregado','Cancelado'));

-- Verificar (opcional)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'pipeline_mf'::regclass;
