process.env.NODE_ENV = 'test';
process.env.SERVICE_NAME = process.env.SERVICE_NAME ?? 'test-service';
process.env.PORT = process.env.PORT ?? '3000';
process.env.LOG_LEVEL = 'silent';
process.env.IDENTITY_SERVICE_URL =
  process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001';
process.env.SALES_SERVICE_URL =
  process.env.SALES_SERVICE_URL ?? 'http://localhost:3002';
process.env.INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3003';
process.env.ACCOUNTING_SERVICE_URL =
  process.env.ACCOUNTING_SERVICE_URL ?? 'http://localhost:3004';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-change-me';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-change-me';
process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://erp:erp_local_only@localhost:5432/identity_db?schema=public';
process.env.RABBITMQ_URL =
  process.env.RABBITMQ_URL ?? 'amqp://erp:erp_local_only@localhost:5672';
process.env.RABBITMQ_QUEUE = process.env.RABBITMQ_QUEUE ?? 'test.events';
