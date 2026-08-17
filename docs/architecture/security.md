# Security

Authorization is enforced on the backend. The Angular client may hide buttons; it is not a security boundary.

## Prepared in this slice

- Secrets via environment variables (validated at boot)
- Helmet on HTTP apps
- Global validation pipe (`whitelist`, `forbidNonWhitelisted`)
- Consistent error envelope (no stack traces in responses)
- Pino redaction of `authorization`, cookies, passwords, tokens
- Gateway rate limiting (`@nestjs/throttler`)
- CORS enabled (tighten origins when the real web origin is known)
- JWT secret names reserved: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- Request correlation id (`x-correlation-id`)
- Optional inbound `x-tenant-id` stored in `AsyncLocalStorage` (not trusted as auth yet)

## Planned

| Control | Approach |
| --- | --- |
| Authentication | Access JWT + rotating refresh tokens issued by Identity |
| Passwords | Strong hash (Argon2 or bcrypt) in Identity only |
| RBAC | Roles and permissions stored in Identity, claims in JWT |
| Policies | Attribute-based checks (resource + action + tenant) in each service |
| Tenant isolation | `tenantId` from the token, applied on every query; never from the client alone |
| Audit logging | Identity and accounting-sensitive actions |
| Service-to-service | Network isolation + optional internal tokens later |

## Rules

- Do not commit `.env`, keys, or database passwords.
- Do not log tokens or passwords.
- Do not implement “admin bypass” flags in production configuration.
