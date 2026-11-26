import { b64url, fromB64url, hmacSign, hmacVerify } from './crypto.js';

export type JwtClaims = {
  sub: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  appId: string;
  companyId?: string;
  truckPlate?: string;
  platformAdmin?: boolean;
  /** Permisos efectivos para autorización en cualquier servicio. */
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export type AccessTokenUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  appId: string;
  companyId?: string;
  truckPlate?: string;
  platformAdmin?: boolean;
  permissions: string[];
};

export function signAccessToken(
  user: Omit<AccessTokenUser, 'roles'> & { roles?: string[] },
  opts: { secret: string; ttlSec: number; issuer: string },
) {
  const now = Math.floor(Date.now() / 1000);
  const roles = user.roles?.length ? user.roles : [user.role];
  const claims: JwtClaims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roles,
    appId: user.appId,
    companyId: user.companyId,
    truckPlate: user.truckPlate,
    platformAdmin: user.platformAdmin || undefined,
    permissions: user.permissions,
    iat: now,
    exp: now + opts.ttlSec,
    iss: opts.issuer,
    aud: user.appId,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  return `${data}.${hmacSign(data, opts.secret)}`;
}

export function verifyAccessToken(
  token: string,
  opts: { secret: string; issuer?: string; audience?: string },
): AccessTokenUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  if (!hmacVerify(data, sig, opts.secret)) return null;
  try {
    const body = JSON.parse(fromB64url(payload).toString('utf8')) as JwtClaims;
    if (!body.exp || body.exp * 1000 < Date.now()) return null;
    if (opts.issuer && body.iss && body.iss !== opts.issuer) return null;
    if (opts.audience && body.aud && body.aud !== opts.audience) return null;
    return {
      id: body.sub,
      email: body.email,
      name: body.name,
      role: body.role,
      roles: body.roles?.length ? body.roles : [body.role],
      appId: body.appId || body.aud || 'opticlean',
      companyId: body.companyId,
      truckPlate: body.truckPlate,
      platformAdmin: Boolean(body.platformAdmin),
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
    };
  } catch {
    return null;
  }
}

/** Decodifica sin verificar (solo depuración / UI). */
export function decodeAccessToken(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(fromB64url(parts[1]).toString('utf8')) as JwtClaims;
  } catch {
    return null;
  }
}
