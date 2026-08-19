import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { SalesModule } from './sales.module';

process.env.SERVICE_NAME = 'sales-service';
process.env.PORT = String(SERVICE_PORTS.sales);
process.env.RABBITMQ_QUEUE = 'sales.events';
if (process.env.DATABASE_URL?.includes('/identity_db')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/identity_db',
    '/sales_db',
  );
}

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(SalesModule, { serviceName: 'sales-service' });
}

void bootstrap();
