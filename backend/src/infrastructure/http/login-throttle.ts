/**
 * Límite de intentos de inicio de sesión, en memoria.
 * - 5 fallos seguidos para el mismo correo desde la misma IP bloquean 15 minutos.
 * - 30 fallos desde una IP (cualquier correo) en 15 minutos bloquean esa IP 15 minutos.
 * Un inicio correcto limpia el contador de ese correo.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 30;

type Bucket = { fails: number; first: number; lockedUntil: number };
const buckets = new Map<string, Bucket>();

function bucket(key: string, now: number) {
  const b = buckets.get(key);
  if (!b || now - b.first > WINDOW_MS) {
    const fresh = { fails: 0, first: now, lockedUntil: b && b.lockedUntil > now ? b.lockedUntil : 0 };
    buckets.set(key, fresh);
    return fresh;
  }
  return b;
}

const keys = (ip: string, email: string) => [`acct:${ip}|${email.trim().toLowerCase()}`, `ip:${ip}`];

/** Segundos de bloqueo restantes, o 0 si puede intentar. */
export function loginBlockedFor(ip: string, email: string, now = Date.now()) {
  const until = Math.max(...keys(ip, email).map((k) => buckets.get(k)?.lockedUntil ?? 0));
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function registerLoginFailure(ip: string, email: string, now = Date.now()) {
  const [acct, ipKey] = keys(ip, email);
  for (const [key, max] of [[acct, MAX_PER_ACCOUNT], [ipKey, MAX_PER_IP]] as const) {
    const b = bucket(key, now);
    b.fails += 1;
    if (b.fails >= max) b.lockedUntil = now + WINDOW_MS;
  }
}

export function registerLoginSuccess(ip: string, email: string) {
  buckets.delete(keys(ip, email)[0]);
}

/** Solo para pruebas. */
export function resetLoginThrottle() {
  buckets.clear();
}

// Limpieza periódica para que el mapa no crezca sin límite.
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.lockedUntil < now && now - b.first > WINDOW_MS) buckets.delete(key);
  }
}, WINDOW_MS).unref();
