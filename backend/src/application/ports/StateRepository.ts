import type { AppState } from '../../domain/types.js';

export interface StateRepository {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
  reset(): Promise<AppState>;
  /** Lee, modifica y guarda de forma atómica respecto a otras escrituras. */
  transaction<T>(fn: (state: AppState) => T | Promise<T>): Promise<{ state: AppState; result: T }>;
}
