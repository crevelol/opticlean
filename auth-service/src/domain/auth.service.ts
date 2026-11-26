import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from '../config.js';
import { resolvePermissions } from './permissions.js';
import { hashPassword, randomToken, verifyPassword } from '../infrastructure/crypto.js';
import { signAccessToken, verifyAccessToken, type AccessTokenUser } from '../infrastructure/jwt.js';
import { AuthStore, type AuthAccount } from '../infrastructure/store.js';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function publicUser(account: AuthAccount): AccessTokenUser {
  const platformAdmin = Boolean(account.platformAdmin || account.id === 'U-ADMIN');
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    roles: [account.role],
    appId: account.appId,
    companyId: account.companyId,
    truckPlate: account.truckPlate,
    platformAdmin,
    permissions: resolvePermissions(
      account.appId,
      account.role,
      account.extraPermissions,
      platformAdmin,
    ),
  };
}

export class AuthService {
  constructor(private store: AuthStore) {}

  /** Sincroniza usuarios legacy de OptiClean (users.json) hacia el store multi-app. */
  syncFromOpticleanUsers(filePath = config.opticleanUsersPath) {
    if (!existsSync(filePath)) return { imported: 0 };
    let raw: { users?: Array<Record<string, unknown>> };
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8')) as { users?: Array<Record<string, unknown>> };
    } catch {
      return { imported: 0 };
    }
    const users = Array.isArray(raw.users) ? raw.users : [];
    let imported = 0;
    const now = new Date().toISOString();
    for (const u of users) {
      const id = String(u.id || '');
      const email = String(u.email || '').toLowerCase();
      const passwordHash = String(u.passwordHash || '');
      if (!id || !email || !passwordHash) continue;
      const existing = this.store.findUserById(id);
      const account: AuthAccount = {
        id,
        appId: 'opticlean',
        email,
        name: String(u.name || email),
        role: String(u.role || 'ops'),
        companyId: String(u.companyId || 'co-innovamf'),
        truckPlate: u.truckPlate ? String(u.truckPlate) : undefined,
        platformAdmin: Boolean(u.platformAdmin) || id === 'U-ADMIN',
        passwordHash,
        active: u.active === false ? false : true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      this.store.upsertUser(account);
      imported += 1;
    }
    this.store.ensureApp({
      id: 'opticlean',
      name: 'OptiClean',
      active: true,
      origins: ['https://opti.innovamf.com', 'https://ops.innovamf.com', 'https://admin.innovamf.com'],
    });
    return { imported };
  }

  /** Escribe de vuelta el hash a users.json de OptiClean para no romper el API legacy. */
  mirrorPasswordToOpticlean(userId: string, passwordHash: string) {
    const filePath = config.opticleanUsersPath;
    if (!existsSync(filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as { version?: number; users: Array<Record<string, unknown>> };
      if (!Array.isArray(raw.users)) return;
      const idx = raw.users.findIndex((u) => u.id === userId);
      if (idx < 0) return;
      raw.users[idx] = { ...raw.users[idx], passwordHash };
      writeFileSync(filePath, JSON.stringify({ version: raw.version || 1, users: raw.users }, null, 2));
    } catch {
      /* best-effort */
    }
  }

  private issueRefresh(account: AuthAccount, familyId?: string) {
    const raw = randomToken(48);
    const id = `rfs-${randomBytes(6).toString('hex')}`;
    const family = familyId || `fam-${randomBytes(6).toString('hex')}`;
    const expiresAt = new Date(Date.now() + config.refreshTtlSec * 1000).toISOString();
    this.store.addRefreshSession({
      id,
      appId: account.appId,
      userId: account.id,
      familyId: family,
      tokenHash: sha256(raw),
      expiresAt,
      createdAt: new Date().toISOString(),
    });
    return {
      refreshToken: raw,
      refreshExpiresIn: config.refreshTtlSec,
      refreshId: id,
      familyId: family,
    };
  }

  private issue(account: AuthAccount, familyId?: string) {
    const user = publicUser(account);
    const accessToken = signAccessToken(user, {
      secret: config.jwtSecret,
      ttlSec: config.jwtTtlSec,
      issuer: config.issuer,
    });
    const refresh = this.issueRefresh(account, familyId);
    return {
      /** Alias compatible con clientes existentes. */
      token: accessToken,
      accessToken,
      refreshToken: refresh.refreshToken,
      refreshSessionId: refresh.refreshId,
      expiresIn: config.jwtTtlSec,
      refreshExpiresIn: refresh.refreshExpiresIn,
      tokenType: 'Bearer' as const,
      user,
    };
  }

  login(input: { appId: string; email: string; password: string }) {
    const appId = (input.appId || 'opticlean').trim();
    if (!this.store.getApp(appId)) throw new Error('Aplicación no registrada.');
    const account = this.store.findUser(appId, input.email);
    if (!account || !account.active || !verifyPassword(input.password, account.passwordHash)) {
      throw new Error('Correo o contraseña incorrectos');
    }
    // Nueva familia de refresh en cada login.
    return this.issue(account);
  }

  /**
   * Renueva access + refresh (rotación).
   * Si se reusa un refresh ya revocado de la misma familia, se invalida la familia (robo detectado).
   */
  refresh(refreshToken: string) {
    const hash = sha256(String(refreshToken || ''));
    const row = this.store.findRefreshByHash(hash);
    if (!row) throw new Error('Refresh token inválido.');
    if (row.revokedAt) {
      this.store.revokeRefreshFamily(row.familyId);
      throw new Error('Refresh token reutilizado. Vuelve a iniciar sesión.');
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      this.store.revokeRefresh(row.id);
      throw new Error('Refresh token expirado.');
    }
    const account = this.store.findUserById(row.userId);
    if (!account || !account.active || account.appId !== row.appId) {
      this.store.revokeRefreshFamily(row.familyId);
      throw new Error('Usuario no disponible.');
    }
    const next = this.issue(account, row.familyId);
    this.store.revokeRefresh(row.id, next.refreshSessionId);
    return next;
  }

  logout(input: { refreshToken?: string; accessToken?: string }) {
    if (input.refreshToken) {
      const row = this.store.findRefreshByHash(sha256(input.refreshToken));
      if (row) this.store.revokeRefreshFamily(row.familyId);
    } else if (input.accessToken) {
      const session = verifyAccessToken(input.accessToken, {
        secret: config.jwtSecret,
        issuer: config.issuer,
      });
      if (session) this.store.revokeUserRefresh(session.id, session.appId);
    }
    return { ok: true as const };
  }

  me(token: string) {
    const user = verifyAccessToken(token, { secret: config.jwtSecret, issuer: config.issuer });
    if (!user) throw new Error('Sesión expirada o inválida');
    return { user };
  }

  introspect(token: string) {
    const user = verifyAccessToken(token, { secret: config.jwtSecret, issuer: config.issuer });
    if (!user) return { active: false as const };
    return {
      active: true as const,
      user,
      permissions: user.permissions,
      role: user.role,
      roles: user.roles,
      appId: user.appId,
      companyId: user.companyId,
      platformAdmin: user.platformAdmin,
    };
  }

  changePassword(input: {
    token: string;
    currentPassword: string;
    newPassword: string;
  }) {
    const session = verifyAccessToken(input.token, { secret: config.jwtSecret, issuer: config.issuer });
    if (!session) throw new Error('Sesión expirada o inválida');
    if (String(input.newPassword || '').length < config.minPasswordLength) {
      throw new Error(`La nueva contraseña debe tener al menos ${config.minPasswordLength} caracteres.`);
    }
    const account = this.store.findUserById(session.id);
    if (!account || !account.active) throw new Error('Usuario no encontrado.');
    if (!verifyPassword(input.currentPassword, account.passwordHash)) {
      throw new Error('La contraseña actual no es correcta.');
    }
    const passwordHash = hashPassword(input.newPassword);
    this.store.updateUser(account.id, { passwordHash });
    this.mirrorPasswordToOpticlean(account.id, passwordHash);
    return { ok: true as const, message: 'Contraseña actualizada.' };
  }

  requestPasswordReset(input: { appId: string; email: string }) {
    const appId = (input.appId || 'opticlean').trim();
    if (!this.store.getApp(appId)) throw new Error('Aplicación no registrada.');
    const account = this.store.findUser(appId, input.email);
    const generic = {
      ok: true as const,
      message: 'Si el correo existe, enviaremos instrucciones para restablecer la contraseña.',
    };
    if (!account || !account.active) return generic;

    const raw = randomToken(32);
    const id = `rst-${randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + config.resetTtlMin * 60_000).toISOString();
    this.store.addReset({
      id,
      appId,
      userId: account.id,
      email: account.email,
      tokenHash: sha256(raw),
      expiresAt,
      createdAt: new Date().toISOString(),
    });
    const resetUrl = `${config.publicResetBaseUrl}?app=${encodeURIComponent(appId)}&token=${encodeURIComponent(raw)}`;
    if (config.exposeResetLink) {
      return { ...generic, resetUrl, expiresAt };
    }
    return generic;
  }

  resetPassword(input: { appId: string; token: string; newPassword: string }) {
    const appId = (input.appId || 'opticlean').trim();
    if (String(input.newPassword || '').length < config.minPasswordLength) {
      throw new Error(`La nueva contraseña debe tener al menos ${config.minPasswordLength} caracteres.`);
    }
    const row = this.store.findReset(appId, sha256(String(input.token || '')));
    if (!row) throw new Error('El enlace no es válido o ya fue usado.');
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      throw new Error('El enlace de restablecimiento expiró.');
    }
    const account = this.store.findUserById(row.userId);
    if (!account || !account.active) throw new Error('Usuario no encontrado.');
    const passwordHash = hashPassword(input.newPassword);
    this.store.updateUser(account.id, { passwordHash });
    this.store.markResetUsed(row.id);
    this.mirrorPasswordToOpticlean(account.id, passwordHash);
    return { ok: true as const, message: 'Contraseña restablecida. Ya puedes iniciar sesión.' };
  }

  registerUser(input: {
    appId: string;
    email: string;
    name: string;
    password: string;
    role?: string;
    companyId?: string;
    truckPlate?: string;
    platformAdmin?: boolean;
    extraPermissions?: string[];
  }) {
    const appId = (input.appId || 'opticlean').trim();
    if (!this.store.getApp(appId)) throw new Error('Aplicación no registrada.');
    const email = String(input.email || '').trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Correo no válido.');
    if (this.store.findUser(appId, email)) throw new Error('Ya existe un usuario con ese correo.');
    if (String(input.password || '').length < config.minPasswordLength) {
      throw new Error(`La contraseña debe tener al menos ${config.minPasswordLength} caracteres.`);
    }
    const now = new Date().toISOString();
    const account = this.store.upsertUser({
      id: `U-${randomBytes(4).toString('hex').toUpperCase()}`,
      appId,
      email,
      name: String(input.name || '').trim() || email,
      role: String(input.role || 'ops'),
      companyId: input.companyId,
      truckPlate: input.truckPlate,
      platformAdmin: Boolean(input.platformAdmin),
      extraPermissions: input.extraPermissions,
      passwordHash: hashPassword(input.password),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return publicUser(account);
  }
}
