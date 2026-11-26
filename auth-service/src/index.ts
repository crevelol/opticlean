import cors from 'cors';
import express from 'express';
import { assertConfig, config } from './config.js';
import { AuthService } from './domain/auth.service.js';
import { AuthStore } from './infrastructure/store.js';
import { buildAuthRouter } from './http/routes.js';

assertConfig();

const store = new AuthStore(config.dbPath);
const auth = new AuthService(store);
const sync = auth.syncFromOpticleanUsers();
console.log(`[auth-service] usuarios OptiClean sincronizados: ${sync.imported}`);

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    service: 'innovamf-auth',
    version: '1.0.0',
    docs: {
      login: 'POST /v1/auth/login',
      me: 'GET /v1/auth/me',
      refresh: 'POST /v1/auth/refresh',
      logout: 'POST /v1/auth/logout',
      introspect: 'POST /v1/auth/introspect',
      changePassword: 'POST /v1/auth/password/change',
      forgotPassword: 'POST /v1/auth/password/forgot',
      resetPassword: 'POST /v1/auth/password/reset',
    },
  });
});

app.use('/v1/auth', buildAuthRouter(auth));
/** Alias corto para proxies internos. */
app.use('/auth', buildAuthRouter(auth));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[auth-service]', err);
  res.status(500).json({ error: 'Error interno de autenticación' });
});

app.listen(config.port, config.host, () => {
  console.log(`[auth-service] listening on http://${config.host}:${config.port}`);
});
