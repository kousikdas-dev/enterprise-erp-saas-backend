import { bootstrapHttpApp, resolveServiceDatabaseUrl, SERVICE_PORTS } from '@app/common';
import { InventoryModule } from './inventory.module';

process.env.SERVICE_NAME = 'inventory-service';
process.env.PORT = String(SERVICE_PORTS.inventory);
process.env.RABBITMQ_QUEUE = 'inventory.events';
resolveServiceDatabaseUrl('inventory');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(InventoryModule, { serviceName: 'inventory-service' });
}

void bootstrap();
