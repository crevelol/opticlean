# InnovaMF Auth Service

Microservicio de autenticación multi-aplicación.

## Capacidad

- `POST /v1/auth/login` — inicio de sesión (`appId`, email, password) → access + **refresh**
- `POST /v1/auth/refresh` — rota refresh y emite nuevo access JWT
- `POST /v1/auth/logout` — revoca la familia de refresh
- `GET /v1/auth/me` — usuario de la sesión
- `POST /v1/auth/introspect` — valida JWT y expone **permisos / rol / empresa**
- `POST /v1/auth/password/change` — cambio de contraseña (Bearer)
- `POST /v1/auth/password/forgot` — solicitud de restablecimiento
- `POST /v1/auth/password/reset` — confirma restablecimiento con token

## Tokens

- **Access JWT** (corto, p. ej. 12 h): lleva permisos para autorizar APIs.
- **Refresh** (opaco, p. ej. 14 d): se guarda hasheado; al usarlo se **rota**. Reusar uno revocado invalida la familia.

El access token incluye:

- `sub`, `email`, `name`, `role`, `roles`
- `appId`, `aud`, `companyId`, `platformAdmin`
- **`permissions`**: lista efectiva para autorizar en cualquier API

## OptiClean

Comparte `OPTICLEAN_JWT_SECRET` / `AUTH_JWT_SECRET` y sincroniza `data/users.json`.
El API de OptiClean puede proxyar `/api/auth/*` hacia este servicio.
