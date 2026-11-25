import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type AuthApp = {
  id: string;
  name: string;
  active: boolean;
  /** Orígenes web permitidos (informativo). */
  origins?: string[];
};

export type AuthAccount = {
  id: string;
  appId: string;
  email: string;
  name: string;
  role: string;
  companyId?: string;
  truckPlate?: string;
  platformAdmin?: boolean;
  /** Permisos adicionales al catálogo del rol. */
  extraPermissions?: string[];
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResetToken = {
  id: string;
  appId: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
};

/** Refresh token opaco (solo se guarda el hash). Rotación por familia. */
export type RefreshSession = {
  id: string;
  appId: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  replacedBy?: string;
  createdAt: string;
};

type DbFile = {
  version: 1;
  apps: AuthApp[];
  users: AuthAccount[];
  resets: ResetToken[];
  refreshSessions: RefreshSession[];
};

export class AuthStore {
  private filePath: string;
  private cache: DbFile | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private empty(): DbFile {
    return {
      version: 1,
      apps: [
        {
          id: 'opticlean',
          name: 'OptiClean',
          active: true,
          origins: ['https://opti.innovamf.com', 'https://ops.innovamf.com', 'https://admin.innovamf.com'],
        },
      ],
      users: [],
      resets: [],
      refreshSessions: [],
    };
  }

  load(): DbFile {
    if (this.cache) return this.cache;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      this.cache = this.empty();
      this.persist();
      return this.cache;
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as DbFile;
      this.cache = {
        version: 1,
        apps: Array.isArray(raw.apps) ? raw.apps : this.empty().apps,
        users: Array.isArray(raw.users) ? raw.users : [],
        resets: Array.isArray(raw.resets) ? raw.resets : [],
        refreshSessions: Array.isArray(raw.refreshSessions) ? raw.refreshSessions : [],
      };
    } catch {
      this.cache = this.empty();
    }
    return this.cache;
  }

  persist() {
    if (!this.cache) return;
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
  }

  getApp(appId: string) {
    return this.load().apps.find((a) => a.id === appId && a.active);
  }

  ensureApp(app: AuthApp) {
    const db = this.load();
    const idx = db.apps.findIndex((a) => a.id === app.id);
    if (idx >= 0) db.apps[idx] = { ...db.apps[idx], ...app };
    else db.apps.push(app);
    this.persist();
  }

  findUser(appId: string, email: string) {
    const e = email.trim().toLowerCase();
    return this.load().users.find((u) => u.appId === appId && u.email.toLowerCase() === e);
  }

  findUserById(userId: string) {
    return this.load().users.find((u) => u.id === userId);
  }

  upsertUser(user: AuthAccount) {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) db.users[idx] = user;
    else db.users.push(user);
    this.persist();
    return user;
  }

  updateUser(userId: string, patch: Partial<AuthAccount>) {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error('Usuario no encontrado.');
    db.users[idx] = { ...db.users[idx], ...patch, updatedAt: new Date().toISOString() };
    this.persist();
    return db.users[idx];
  }

  addReset(token: ResetToken) {
    const db = this.load();
    db.resets = db.resets.filter((r) => !r.usedAt && new Date(r.expiresAt).getTime() > Date.now());
    db.resets.push(token);
    this.persist();
  }

  findReset(appId: string, tokenHash: string) {
    return this.load().resets.find(
      (r) => r.appId === appId && r.tokenHash === tokenHash && !r.usedAt,
    );
  }

  markResetUsed(id: string) {
    const db = this.load();
    const row = db.resets.find((r) => r.id === id);
    if (row) {
      row.usedAt = new Date().toISOString();
      this.persist();
    }
  }

  listUsers(appId?: string) {
    const users = this.load().users;
    return appId ? users.filter((u) => u.appId === appId) : users;
  }

  addRefreshSession(session: RefreshSession) {
    const db = this.load();
    const now = Date.now();
    db.refreshSessions = db.refreshSessions.filter(
      (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now,
    );
    db.refreshSessions.push(session);
    this.persist();
  }

  findRefreshByHash(tokenHash: string) {
    return this.load().refreshSessions.find((s) => s.tokenHash === tokenHash);
  }

  revokeRefresh(id: string, replacedBy?: string) {
    const db = this.load();
    const row = db.refreshSessions.find((s) => s.id === id);
    if (!row) return;
    row.revokedAt = new Date().toISOString();
    if (replacedBy) row.replacedBy = replacedBy;
    this.persist();
  }

  revokeRefreshFamily(familyId: string) {
    const db = this.load();
    const now = new Date().toISOString();
    for (const row of db.refreshSessions) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = now;
    }
    this.persist();
  }

  revokeUserRefresh(userId: string, appId?: string) {
    const db = this.load();
    const now = new Date().toISOString();
    for (const row of db.refreshSessions) {
      if (row.userId !== userId) continue;
      if (appId && row.appId !== appId) continue;
      if (!row.revokedAt) row.revokedAt = now;
    }
    this.persist();
  }
}
