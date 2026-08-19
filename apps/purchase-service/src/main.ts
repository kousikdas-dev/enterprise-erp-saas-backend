import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { PurchaseModule } from './purchase.module';

process.env.SERVICE_NAME = 'purchase-service';
process.env.PORT = String(SERVICE_PORTS.purchase);
process.env.RABBITMQ_QUEUE = 'purchase.events';
if (process.env.DATABASE_URL?.includes('/identity_db')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/identity_db',
    '/purchase_db',
  );
}

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(PurchaseModule, { serviceName: 'purchase-service' });
}

void bootstrap();
