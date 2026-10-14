import { bootstrapHttpApp, resolveServiceDatabaseUrl, SERVICE_PORTS } from '@app/common';
import { PurchaseModule } from './purchase.module';

process.env.SERVICE_NAME = 'purchase-service';
process.env.PORT = String(SERVICE_PORTS.purchase);
process.env.RABBITMQ_QUEUE = 'purchase.events';
resolveServiceDatabaseUrl('purchase');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(PurchaseModule, { serviceName: 'purchase-service' });
}

void bootstrap();
