-- ============================================================================
-- BLINDAJE FINAL CONTRA ÓRDENES DUPLICADAS
-- ============================================================================
-- Este script:
-- 1) Detecta pipelines con múltiples órdenes (duplicados)
-- 2) Mantiene solo la orden más reciente por pipeline_id
-- 3) Borra las duplicadas
-- 4) Agrega constraint UNIQUE para que Postgres bloquee duplicados a futuro
--
-- ⚠ ANTES DE CORRER: revisa los duplicados con la query de inspección.
-- Si quieres consolidar datos manualmente, hazlo ANTES de eliminar.
-- ============================================================================

-- PASO 1: Inspección — ver pipelines con múltiples órdenes
-- ----------------------------------------------------------------------------
-- Corre primero esta query para ver cuántos duplicados hay:
SELECT
  pipeline_id,
  COUNT(*) AS num_ordenes,
  array_agg(id ORDER BY created_at DESC) AS ids,
  array_agg(created_at ORDER BY created_at DESC) AS fechas
FROM ordenes_produccion
WHERE pipeline_id IS NOT NULL
GROUP BY pipeline_id
HAVING COUNT(*) > 1
ORDER BY num_ordenes DESC;

-- ============================================================================
-- PASO 2: Limpiar duplicados (mantiene la MÁS RECIENTE de cada pipeline)
-- ============================================================================
-- ⚠ Antes de ejecutar este DELETE, asegúrate de que la orden más reciente
-- tenga los datos buenos (consolida con la página de diagnóstico si no).
--
-- Esta query borra todas las órdenes duplicadas EXCEPTO la más reciente
-- por pipeline_id:

WITH ranked AS (
  SELECT
    id,
    pipeline_id,
    ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY created_at DESC) AS rn
  FROM ordenes_produccion
  WHERE pipeline_id IS NOT NULL
)
DELETE FROM ordenes_produccion
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================================
-- PASO 3: Agregar constraint UNIQUE en pipeline_id
-- ============================================================================
-- A partir de aquí, Postgres NUNCA permitirá dos filas con el mismo pipeline_id.
-- Cualquier intento de INSERT con un pipeline_id existente falla con error 23505.
--
-- Nota: este constraint permite múltiples NULL (Postgres por default considera
-- NULL distintos entre sí en UNIQUE), así que no rompe órdenes huérfanas.

ALTER TABLE ordenes_produccion
  DROP CONSTRAINT IF EXISTS ordenes_produccion_pipeline_unique;

ALTER TABLE ordenes_produccion
  ADD CONSTRAINT ordenes_produccion_pipeline_unique
  UNIQUE (pipeline_id);

-- ============================================================================
-- VERIFICACIÓN FINAL — debería estar limpio
-- ============================================================================
SELECT pipeline_id, COUNT(*)
FROM ordenes_produccion
WHERE pipeline_id IS NOT NULL
GROUP BY pipeline_id
HAVING COUNT(*) > 1;
-- Esta query debe regresar 0 filas. Si regresa algo, queda algún duplicado.
