-- Momentos del día en que encaja una receta: 'desayuno', 'almuerzo', 'cena'.
-- Por ahora solo se llena en las bebidas, para que la ruleta de acompañante
-- ofrezca las del momento que eligió el usuario (café en el desayuno,
-- refrescos en el almuerzo, infusiones en la cena). Una bebida puede servir
-- para más de un momento; un arreglo vacío la deja fuera de esas ruletas.
ALTER TABLE "public"."recetas" ADD COLUMN "momentos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- El filtro de la API es "momentos contiene X" (operador @>), que un GIN
-- resuelve sin recorrer la tabla.
CREATE INDEX "recetas_momentos_idx" ON "public"."recetas" USING GIN ("momentos");
