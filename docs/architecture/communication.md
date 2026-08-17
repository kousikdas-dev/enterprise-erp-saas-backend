# Communication

Services communicate in two ways.

## Synchronous REST

The web client talks only to the API Gateway. The gateway will call domain services over HTTP using configured base URLs:

- `IDENTITY_SERVICE_URL`
- `SALES_SERVICE_URL`
- `INVENTORY_SERVICE_URL`
- `ACCOUNTING_SERVICE_URL`

Public and internal HTTP APIs use `/api/v1/...`.

Use REST when the caller needs an immediate consistent response (login, get order by id, health).

Service-to-service REST is allowed for queries that cannot wait (for example Identity token introspection later). It is not allowed as a way to read another service’s database.

## Asynchronous events (RabbitMQ)

Cross-domain business facts travel on RabbitMQ. Contracts live in `@app/messaging` so publishers and consumers share names and payload shapes.

Examples:

| Event | Publisher | Intended consumers |
| --- | --- | --- |
| `sales.invoice.posted` | Sales | Accounting (AR / revenue), Inventory (if fulfillment) |
| `inventory.goods.received` | Inventory | Accounting (inventory / AP) |
| `accounting.journal.posted` | Accounting | Reporting (future) |
| `identity.user.created` | Identity | Audit / notification (future) |

Envelope (every event):

- `eventId`
- `eventName`
- `tenantId`
- `occurredAt`
- `payload`

`tenantId` is mandatory so consumers never post into the wrong tenant.

## What is wired today

- Each app registers a NestJS RabbitMQ client (`EVENT_BUS`).
- Queues are named per service (`identity.events`, `sales.events`, …).
- No domain publishers or subscribers are implemented yet.

## Anti-patterns

- Sharing Prisma models across services
- Calling `sales_db` from Accounting
- Embedding financial posting logic inside Sales
- Relying on the Angular client for authorization
