import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getAdminDb, adminDbPath } from '../db/adminDb.js';
import { usersFilePath } from '../auth/auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const kept = () => Math.max(1, Number(process.env.OPTICLEAN_BACKUPS_KEPT ?? 14) || 14);

/**
 * Respaldo diario de usuarios (users.json) y de la base de empresas, menú y flota (admin.db),
 * junto a los respaldos del estado. La base SQLite se copia con VACUUM INTO, que produce
 * una copia consistente aunque esté en uso.
 */
export async function backupAuthData(backupsDir: string, day = new Date().toISOString().slice(0, 10)) {
  await mkdir(backupsDir, { recursive: true });
  const done: string[] = [];
  const users = usersFilePath();
  const usersTarget = path.join(backupsDir, `users-${day}.json`);
  if (existsSync(users) && !existsSync(usersTarget)) {
    await copyFile(users, usersTarget);
    done.push(usersTarget);
  }
  const dbTarget = path.join(backupsDir, `admin-${day}.db`);
  if (existsSync(adminDbPath()) && !existsSync(dbTarget)) {
    getAdminDb().exec(`VACUUM INTO '${dbTarget.replace(/'/g, "''")}'`);
    done.push(dbTarget);
  }
  for (const prefix of ['users-', 'admin-']) {
    const mine = (await readdir(backupsDir))
      .filter((name) => name.startsWith(prefix) && /\d{4}-\d{2}-\d{2}\.(json|db)$/.test(name))
      .sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - kept()))) {
      await unlink(path.join(backupsDir, old)).catch(() => undefined);
    }
  }
  return done;
}

/** Respalda al arrancar y luego una vez al día. */
export function scheduleAuthBackups(backupsDir: string) {
  const run = () =>
    backupAuthData(backupsDir).catch((err) => console.error('[backup] No se pudo respaldar usuarios y empresas:', err));
  void run();
  setInterval(run, DAY_MS).unref();
}
