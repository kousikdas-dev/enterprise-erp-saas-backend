# Database

PostgreSQL is the initial database engine. Each microservice owns its database. Local Compose creates four databases in one Postgres instance; that is a hosting convenience, not a shared schema.

| Service | Database | Prisma schema |
| --- | --- | --- |
| Identity | `identity_db` | `apps/identity-service/prisma/schema.prisma` |
| Sales | `sales_db` | `apps/sales-service/prisma/schema.prisma` |
| Inventory | `inventory_db` | `apps/inventory-service/prisma/schema.prisma` |
| Accounting | `accounting_db` | `apps/accounting-service/prisma/schema.prisma` |

The API Gateway has no database.

## Prisma

- Each service generates its own Prisma Client into `apps/<service>/generated/prisma-client` (gitignored).
- `PrismaService` is duplicated per service on purpose.
- A `_schema_meta` table exists only so migrations and client generation work before domain models exist. It is not a business API.

## Isolation rules

1. No foreign keys across databases.
2. Cross-service references use IDs in events or REST responses, not joins.
3. Accounting persists journals only in `accounting_db`.
4. Every future business table includes `tenantId`.

## Migrations

Run generate and migrate **per schema**. See the root README. Never run a single migration that touches more than one service database.
