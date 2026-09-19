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

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().default(30),

  GOOGLE_CLIENT_ID: Joi.string().required(),

  COOKIE_DOMAIN: Joi.string().optional().allow(''),
});
