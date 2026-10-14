import { bootstrapHttpApp, resolveServiceDatabaseUrl, SERVICE_PORTS } from '@app/common';
import { SalesModule } from './sales.module';

process.env.SERVICE_NAME = 'sales-service';
process.env.PORT = String(SERVICE_PORTS.sales);
process.env.RABBITMQ_QUEUE = 'sales.events';
resolveServiceDatabaseUrl('sales');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(SalesModule, { serviceName: 'sales-service' });
}

void bootstrap();
