# Multi-tenancy

The product is SaaS. A **tenant** is a company (customer of the platform). Users belong to a tenant. Every business record will carry `tenantId`.

## Model (target)

```text
Tenant
  └── User
        └── Role(s)
              └── Permission(s)
                    └── Policy(s)
```

Identity owns tenant and user aggregates. Other services store `tenantId` on their own rows and never look up another tenant’s data.

## Request flow (target)

1. Client authenticates against Identity through the gateway.
2. Access token includes `sub` (user id) and `tid` (tenant id).
3. Gateway validates the JWT and forwards identity headers to domain services.
4. Each service runs queries with `WHERE tenantId = :tid`.
5. Events include `tenantId` in the envelope.

## What exists today

`libs/common` provides `requestContextStorage`:

- Reads `x-tenant-id` and `x-correlation-id`
- `getRequiredTenantId()` for future repositories

The header is **not** a substitute for a verified token. Until JWT lands, treat tenant context as scaffolding only.

## Isolation rules

- No shared tables across tenants without `tenantId`.
- No “list all tenants’ invoices” API except a future platform-operator surface with its own authorization.
- Caching, search indexes, and logs must not leak tenant data.
