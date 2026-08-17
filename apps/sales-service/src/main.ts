import { bootstrapHttpApp } from '@app/common';
import { SalesModule } from './sales.module';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(SalesModule, { serviceName: 'sales-service' });
}

void bootstrap();
