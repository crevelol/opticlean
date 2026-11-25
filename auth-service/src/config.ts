import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_DATA = path.resolve(ROOT, '../data');

function env(name: string, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  port: Number(env('AUTH_PORT', '3012')),
  host: env('AUTH_HOST', '127.0.0.1'),
  /** Mismo secreto que OptiClean para tokens compartidos. */
  jwtSecret: env('AUTH_JWT_SECRET') || env('OPTICLEAN_JWT_SECRET') || 'innovamf-auth-dev-secret-change-me',
  jwtTtlSec: Number(env('AUTH_JWT_TTL', env('OPTICLEAN_JWT_TTL', String(60 * 60 * 12)))),
  /** Refresh token: por defecto 14 días. */
  refreshTtlSec: Number(env('AUTH_REFRESH_TTL', String(60 * 60 * 24 * 14))),
  issuer: env('AUTH_ISSUER', 'innovamf-auth'),
  dbPath: env('AUTH_DB_PATH', path.join(REPO_DATA, 'auth', 'auth-db.json')),
  /** Importa usuarios de OptiClean al arrancar. */
  opticleanUsersPath: env('OPTICLEAN_USERS_PATH', path.join(REPO_DATA, 'users.json')),
  /** Si true, forgot-password puede devolver el link (útil en demos / sin SMTP). */
  exposeResetLink: env('AUTH_EXPOSE_RESET_LINK', '1') === '1',
  publicResetBaseUrl: env('AUTH_RESET_BASE_URL', 'https://opti.innovamf.com/restablecer'),
  resetTtlMin: Number(env('AUTH_RESET_TTL_MIN', '30')),
  minPasswordLength: Number(env('AUTH_MIN_PASSWORD_LENGTH', '8')),
  isProd: env('NODE_ENV') === 'production',
};

export function assertConfig() {
  if (config.isProd && config.jwtSecret.length < 32) {
    throw new Error('[auth-service] AUTH_JWT_SECRET / OPTICLEAN_JWT_SECRET debe tener al menos 32 caracteres en producción.');
  }
}
