import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StateRepository } from '../../application/ports/StateRepository.js';
import { seed } from '../../domain/seed.js';
import { migrateState } from '../../domain/state-migrate.js';
import type { AppState } from '../../domain/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export class JsonStateRepository implements StateRepository {
  private async ensureDir() {
    await mkdir(DATA_DIR, { recursive: true });
  }

  async load(): Promise<AppState> {
    await this.ensureDir();
    try {
      const raw = await readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as AppState;
      if (parsed?.version === 1 || parsed?.version === 2) {
        const migrated = migrateState(parsed);
        if (migrated.version !== parsed.version || JSON.stringify(migrated) !== JSON.stringify(parsed)) {
          await this.save(migrated);
        }
        return migrated;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backup = `${STATE_FILE}.corrupt-${Date.now()}`;
        await rename(STATE_FILE, backup).catch(() => undefined);
        console.error(`[state] state.json ilegible; respaldo en ${backup}`, err);
      }
    }
    const initial = seed();
    await this.save(initial);
    return initial;
  }

  async save(state: AppState): Promise<void> {
    await this.ensureDir();
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, STATE_FILE);
  }

  async reset(): Promise<AppState> {
    const initial = seed();
    await this.save(initial);
    return initial;
  }
}
