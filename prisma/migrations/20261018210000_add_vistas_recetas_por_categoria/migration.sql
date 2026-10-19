-- Vistas por categoría para revisar y editar las recetas con más orden.
-- No son tablas nuevas: cada vista filtra "recetas" por el slug de su
-- categoría, así que favoritos, historial y la API siguen apuntando a una
-- sola tabla. Al leer de una única tabla, Postgres las hace actualizables:
-- un UPDATE sobre la vista modifica la fila real de "recetas".
--
-- WITH CHECK OPTION impide que, editando desde una vista, una receta se
-- mueva a otra categoría (desaparecería de la vista sin que se note).
--
-- Se dejan fuera las columnas imagen_* (la imagen en bytes y sus metadatos)
-- para que las vistas carguen rápido y no se editen por accidente.

CREATE VIEW "public"."recetas_desayuno" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'desayunos')
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_almuerzo" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'almuerzos')
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_bebidas" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'bebidas')
WITH CHECK OPTION;
