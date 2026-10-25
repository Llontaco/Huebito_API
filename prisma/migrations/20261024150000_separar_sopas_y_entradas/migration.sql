-- Separa de "almuerzos" las sopas/chupes y las entradas en dos categorías
-- nuevas. Las recetas siguen en la misma tabla "recetas" (solo cambia su
-- categoria_id), así que fotos, videos, favoritos e historial no se tocan.
--
-- Criterio: cómo se comen en Perú. Quedan como segundos aunque el nombre
-- parezca sopa: sopa seca chinchana (es un tallarín), locro de zapallo,
-- locro de pecho y mondonguito a la italiana (guisos), escabeche y rocoto
-- relleno.

INSERT INTO "public"."categorias" ("nombre", "slug") VALUES
  ('Sopas y chupes', 'sopas'),
  ('Entradas', 'entradas')
ON CONFLICT ("slug") DO NOTHING;

UPDATE "public"."recetas"
SET "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'sopas')
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'almuerzos')
  AND "nombre" IN (
    'Aguadito de Mariscos', 'Aguadito de Pollo', 'Caldo de Gallina', 'Caldo de Mote',
    'Chairo', 'Chupe de Camarones', 'Chupe de Pescado', 'Chupe de Quinua', 'Chupe Verde',
    'Inchicapi', 'Menestrón', 'Parihuela', 'Patasca', 'Shámbar', 'Sopa Criolla',
    'Sopa de Choros', 'Sopa de Habas', 'Sopa de Morón', 'Sopa de Quinua', 'Sopa Wantán',
    'Timbuche'
  );

UPDATE "public"."recetas"
SET "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'entradas')
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'almuerzos')
  AND "nombre" IN (
    'Anticuchos de corazón', 'Causa de Atún', 'Causa Limeña', 'Ceviche',
    'Ceviche de Champiñones', 'Ceviche de Conchas Negras', 'Ceviche de Pulpo',
    'Ceviche Mixto', 'Conchitas a la Parmesana', 'Jalea Mixta', 'Leche de Tigre',
    'Ocopa Arequipeña', 'Papa a la Huancaína', 'Papa Rellena', 'Pulpo al Olivo',
    'Solterito Arequipeño', 'Tiradito de Pescado'
  );

-- Vistas de las categorías nuevas, igual que las de las otras categorías.
CREATE VIEW "public"."recetas_sopa" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'sopas')
WITH CHECK OPTION;

CREATE VIEW "public"."recetas_entrada" AS
SELECT "id", "categoria_id", "nombre", "descripcion", "ingredientes", "preparacion",
       "tiempo_minutos", "dificultad", "imagen_asset", "bebida", "acompanamiento", "video_url"
FROM "public"."recetas"
WHERE "categoria_id" = (SELECT "id" FROM "public"."categorias" WHERE "slug" = 'entradas')
WITH CHECK OPTION;
