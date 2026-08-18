# Services

## API Gateway (`apps/api-gateway`)

Public HTTP entry point on port **3000**.

Responsibilities now:

- URI versioning (`/api/v1`)
- OpenAPI / Swagger at `/api/docs`
- Structured logging, helmet, validation, global exception filter
- Rate limiting
- Health checks
- Downstream service URL registry
- RabbitMQ client registration for future edge events

Responsibilities next:

- JWT access-token validation
- Forward `x-tenant-id` / authenticated tenant context
- Reverse-proxy or BFF-style routing to domain services
- Correlation IDs already started (`x-correlation-id`)

The gateway has **no database**.

## Identity Service (`apps/identity-service`)

Port **3001**, database **identity_db**.

Target domain: Tenant, User, credential storage (hashed passwords), refresh tokens, Role, Permission, Policy, audit log.

This is the source of truth for who a caller is and which tenant they belong to. Other services will trust gateway-validated tokens and still enforce tenant isolation on every query.

## Sales Service (`apps/sales-service`)

Port **3002**, database **sales_db**.

Target domain: sales orders and invoices. When an invoice is posted, Sales will publish `sales.invoice.posted`. Accounting will subscribe and create:

- Debit Accounts Receivable
- Credit Sales Revenue

Sales must not write journals itself.

## Inventory Service (`apps/inventory-service`)

Listens on **3003**, database **inventory_db**.

In Docker Compose the container is reachable as `http://inventory-service:3003` on the internal network. That port is not published on the host; clients use API Gateway **3000**. Local `npm run start:inventory` still binds host **3003** for hybrid development.

Target domain: items, warehouses, stock ledger, reservations. Stock and goods-receipt events will drive accounting (inventory vs accounts payable) without sharing tables.

## Accounting Service (`apps/accounting-service`)

Port **3004**, database **accounting_db**.

Core financial domain. Target: chart of accounts, journal entries with balanced lines, general ledger, trial balance, profit and loss, balance sheet.

The posting engine is **not** implemented in this slice. Event contracts and service isolation are in place so it can be added without reaching into other databases.

## Shared libraries

| Package | Path | Role |
| --- | --- | --- |
| `@app/common` | `libs/common` | Bootstrap, config validation, HTTP envelope, health, logging, request/tenant context |
| `@app/messaging` | `libs/messaging` | Domain event names, payload types, `MessagingModule` |

## Not in this repository yet

CRM, Purchase, Production, Reporting, Notification, Meeting, Advanced MRP, Capacity Planning, Shop Floor.
