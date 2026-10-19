-- Más vistas para revisar las recetas con orden, en la línea de
-- 20261018210000_add_vistas_recetas_por_categoria:
--
--   recetas_cena               las recetas de la categoría "cenas"
--   recetas_bebidas_desayuno   bebidas que salen en la ruleta del desayuno
--   recetas_bebidas_almuerzo   bebidas que salen en la ruleta del almuerzo
--   recetas_bebidas_cena       bebidas que salen en la ruleta de la cena
--
-- Una bebida puede estar en varios momentos, así que puede aparecer en más
-- de una vista de bebidas: es la misma fila de "recetas" vista desde varios
-- lados. Las vistas de bebidas incluyen la columna momentos para que se vea
-- en qué otras ruletas sale. Todas son actualizables y WITH CHECK OPTION
-- impide que una edición saque la fila de la vista desde la que se edita.

CREATE VIEW "public"."recetas_cena" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'cenas')
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_bebidas_desayuno" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url", "momentos"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'bebidas')
  AND "momentos" @> ARRAY['desayuno']::TEXT[]
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_bebidas_almuerzo" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url", "momentos"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'bebidas')
  AND "momentos" @> ARRAY['almuerzo']::TEXT[]
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_bebidas_cena" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url", "momentos"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'bebidas')
  AND "momentos" @> ARRAY['cena']::TEXT[]
WITH CHECK OPTION;
