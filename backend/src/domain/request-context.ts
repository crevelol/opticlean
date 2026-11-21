import { AsyncLocalStorage } from 'node:async_hooks';

/** Usuario y empresa de la petición en curso (auditoría y aislamiento por empresa). */
export type RequestActor = {
  id: string;
  name: string;
  role: string;
  companyId: string;
};

const storage = new AsyncLocalStorage<RequestActor>();

export const DEFAULT_COMPANY_ID = 'co-innovamf';

export function runAs<T>(actor: RequestActor, fn: () => T): T {
  return storage.run(actor, fn);
}

export function currentActor(): RequestActor | undefined {
  return storage.getStore();
}

export function currentCompanyId(): string {
  return storage.getStore()?.companyId || DEFAULT_COMPANY_ID;
}
