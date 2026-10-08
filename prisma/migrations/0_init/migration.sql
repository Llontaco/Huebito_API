-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."categorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."favoritos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "receta_id" INTEGER NOT NULL,
    "fecha_guardado" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favoritos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."historial" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "receta_id" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recetas" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "ingredientes" JSONB NOT NULL DEFAULT '[]',
    "preparacion" JSONB NOT NULL DEFAULT '[]',
    "tiempo_minutos" INTEGER,
    "dificultad" TEXT,
    "imagen_asset" TEXT,
    "bebida" TEXT,
    "acompanamiento" TEXT,
    "video_url" TEXT,
    "imagen_datos" BYTEA,
    "imagen_mime" TEXT,
    "imagen_ancho" INTEGER,
    "imagen_alto" INTEGER,
    "imagen_bytes" INTEGER,
    "imagen_fuente" TEXT,
    "imagen_autor" TEXT,
    "imagen_licencia" TEXT,
    "imagen_query" TEXT,
    "imagen_titulo" TEXT,

    CONSTRAINT "recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "foto_url" TEXT,
    "google_id" TEXT,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "public"."categorias"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "favoritos_usuario_id_receta_id_key" ON "public"."favoritos"("usuario_id" ASC, "receta_id" ASC);

-- CreateIndex
CREATE INDEX "idx_favoritos_usuario_id" ON "public"."favoritos"("usuario_id" ASC);

-- CreateIndex
CREATE INDEX "idx_historial_usuario_id" ON "public"."historial"("usuario_id" ASC);

-- CreateIndex
CREATE INDEX "idx_recetas_categoria_id" ON "public"."recetas"("categoria_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "public"."usuarios"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_google_id_key" ON "public"."usuarios"("google_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."favoritos" ADD CONSTRAINT "favoritos_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."favoritos" ADD CONSTRAINT "favoritos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."historial" ADD CONSTRAINT "historial_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."historial" ADD CONSTRAINT "historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recetas" ADD CONSTRAINT "recetas_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

