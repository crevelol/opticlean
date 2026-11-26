import { Router, type Request, type Response } from 'express';
import { AuthService } from '../domain/auth.service.js';

function bearer(req: Request) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function sendError(res: Response, status: number, error: unknown) {
  res.status(status).json({ error: error instanceof Error ? error.message : 'Error' });
}

export function buildAuthRouter(auth: AuthService) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'auth', version: '1.0.0' });
  });

  /** Login multi-app. Body: { appId?, email, password } */
  router.post('/login', (req, res) => {
    try {
      const result = auth.login({
        appId: String(req.body?.appId || 'opticlean'),
        email: String(req.body?.email || ''),
        password: String(req.body?.password || ''),
      });
      res.json(result);
    } catch (e) {
      sendError(res, 401, e);
    }
  });

  /** Sesión actual + permisos del JWT. */
  router.get('/me', (req, res) => {
    try {
      res.json(auth.me(bearer(req)));
    } catch (e) {
      sendError(res, 401, e);
    }
  });

  /** Renueva access JWT + rota el refresh token. Body: { refreshToken } */
  router.post('/refresh', (req, res) => {
    try {
      res.json(auth.refresh(String(req.body?.refreshToken || '')));
    } catch (e) {
      sendError(res, 401, e);
    }
  });

  /** Cierra sesión / revoca refresh (familia). */
  router.post('/logout', (req, res) => {
    try {
      res.json(
        auth.logout({
          refreshToken: req.body?.refreshToken ? String(req.body.refreshToken) : undefined,
          accessToken: bearer(req) || (req.body?.accessToken ? String(req.body.accessToken) : undefined),
        }),
      );
    } catch (e) {
      sendError(res, 400, e);
    }
  });

  /**
   * Introspección para otros microservicios:
   * valida el JWT y devuelve permisos/rol/empresa.
   */
  router.post('/introspect', (req, res) => {
    const token = String(req.body?.token || bearer(req) || '');
    res.json(auth.introspect(token));
  });

  /** Cambio de contraseña (usuario autenticado). */
  router.post('/password/change', (req, res) => {
    try {
      const result = auth.changePassword({
        token: bearer(req),
        currentPassword: String(req.body?.currentPassword || ''),
        newPassword: String(req.body?.newPassword || ''),
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      sendError(res, msg.includes('Sesión') ? 401 : 400, e);
    }
  });

  /** Solicitud de reset (olvidé mi contraseña). */
  router.post('/password/forgot', (req, res) => {
    try {
      const result = auth.requestPasswordReset({
        appId: String(req.body?.appId || 'opticlean'),
        email: String(req.body?.email || ''),
      });
      res.json(result);
    } catch (e) {
      sendError(res, 400, e);
    }
  });

  /** Confirmar reset con token del correo/enlace. */
  router.post('/password/reset', (req, res) => {
    try {
      const result = auth.resetPassword({
        appId: String(req.body?.appId || 'opticlean'),
        token: String(req.body?.token || ''),
        newPassword: String(req.body?.newPassword || ''),
      });
      res.json(result);
    } catch (e) {
      sendError(res, 400, e);
    }
  });

  /** Alta de usuario para una app (uso interno / admin de plataforma). */
  router.post('/users', (req, res) => {
    try {
      const user = auth.registerUser({
        appId: String(req.body?.appId || 'opticlean'),
        email: String(req.body?.email || ''),
        name: String(req.body?.name || ''),
        password: String(req.body?.password || ''),
        role: req.body?.role ? String(req.body.role) : undefined,
        companyId: req.body?.companyId ? String(req.body.companyId) : undefined,
        truckPlate: req.body?.truckPlate ? String(req.body.truckPlate) : undefined,
        platformAdmin: Boolean(req.body?.platformAdmin),
        extraPermissions: Array.isArray(req.body?.extraPermissions)
          ? req.body.extraPermissions.map(String)
          : undefined,
      });
      res.status(201).json({ user });
    } catch (e) {
      sendError(res, 400, e);
    }
  });

  return router;
}
