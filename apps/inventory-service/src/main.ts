import { bootstrapHttpApp } from '@app/common';
import { InventoryModule } from './inventory.module';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(InventoryModule, { serviceName: 'inventory-service' });
}

void bootstrap();
