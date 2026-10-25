import * as Joi from 'joi';

// Valida process.env al arrancar. Si falta algo crítico (p.ej. un secreto JWT
// o el client id de Google) la app NO levanta, en vez de correr en un estado
// inseguro o fallar de forma confusa más tarde en runtime.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  CORS_ORIGINS: Joi.string().required(),

  // Con este secreto se firman los tokens de sesión: quien lo conozca puede
  // hacerse pasar por cualquier usuario. Se rechazan los valores de ejemplo de
  // .env.example y cualquier texto que diga "cambia"/"reemplaza", para que la
  // API no arranque nunca con un secreto público.
  JWT_ACCESS_SECRET: Joi.string()
    .min(32)
    .required()
    .pattern(/cambia|reemplaza|change-?me|secret-?here/i, { invert: true })
    .messages({
      'string.pattern.invert.base':
        'JWT_ACCESS_SECRET es un valor de ejemplo: genera uno con  node -e "console.log(require(\x27crypto\x27).randomBytes(48).toString(\x27base64url\x27))"',
    }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().default(30),

  GOOGLE_CLIENT_ID: Joi.string().required(),

  COOKIE_DOMAIN: Joi.string().optional().allow(''),

  // Clave de la API de Claude para el asistente. Opcional: sin ella la API
  // funciona y solo POST /chat responde 503.
  ANTHROPIC_API_KEY: Joi.string().optional().allow(''),
  COOKIE_PATH: Joi.string().optional().allow(''),
});
