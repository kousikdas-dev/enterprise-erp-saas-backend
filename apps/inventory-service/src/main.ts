import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { InventoryModule } from './inventory.module';

process.env.SERVICE_NAME = 'inventory-service';
process.env.PORT = String(SERVICE_PORTS.inventory);
process.env.RABBITMQ_QUEUE = 'inventory.events';
if (process.env.DATABASE_URL?.includes('/identity_db')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/identity_db',
    '/inventory_db',
  );
}

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(InventoryModule, { serviceName: 'inventory-service' });
}

void bootstrap();
