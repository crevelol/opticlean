export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'ops' | 'dispatch' | 'driver';
  companyId?: string;
  truckPlate?: string;
  platformAdmin?: boolean;
  /** Permisos del JWT (microservicio auth / API). */
  permissions?: string[];
  appId?: string;
};

const TOKEN_KEY = 'opticlean.auth.token';
const REFRESH_KEY = 'opticlean.auth.refresh';
const USER_KEY = 'opticlean.auth.user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser, refreshToken?: string | null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else if (refreshToken === null) localStorage.removeItem(REFRESH_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}
