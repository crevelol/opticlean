/**
 * Cliente del microservicio de autenticación.
 * Si AUTH_SERVICE_URL no está definido, las funciones devuelven null y el API usa el flujo local.
 */

const baseUrl = () => (process.env.AUTH_SERVICE_URL || '').replace(/\/$/, '');

async function callAuth<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T | null> {
  const root = baseUrl();
  if (!root) return null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${root}${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Auth service ${res.status}`);
  }
  return data;
}

export function authServiceEnabled() {
  return Boolean(baseUrl());
}

export async function authServiceLogin(email: string, password: string, appId = 'opticlean') {
  return callAuth<{
    token: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
    user: Record<string, unknown>;
  }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ appId, email, password }),
  });
}

export async function authServiceRefresh(refreshToken: string) {
  return callAuth<{
    token: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    refreshExpiresIn?: number;
    user: Record<string, unknown>;
  }>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function authServiceLogout(input: { refreshToken?: string; accessToken?: string }) {
  return callAuth<{ ok: boolean }>('/v1/auth/logout', {
    method: 'POST',
    token: input.accessToken,
    body: JSON.stringify({
      refreshToken: input.refreshToken,
      accessToken: input.accessToken,
    }),
  });
}

export async function authServiceForgot(email: string, appId = 'opticlean') {
  return callAuth<{ ok: boolean; message: string; resetUrl?: string; expiresAt?: string }>(
    '/v1/auth/password/forgot',
    { method: 'POST', body: JSON.stringify({ appId, email }) },
  );
}

export async function authServiceReset(token: string, newPassword: string, appId = 'opticlean') {
  return callAuth<{ ok: boolean; message: string }>('/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ appId, token, newPassword }),
  });
}

export async function authServiceChange(
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  return callAuth<{ ok: boolean; message: string }>('/v1/auth/password/change', {
    method: 'POST',
    token,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function authServiceIntrospect(token: string) {
  return callAuth<{
    active: boolean;
    user?: Record<string, unknown>;
    permissions?: string[];
  }>('/v1/auth/introspect', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
