import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { ProductionModule } from './production.module';

process.env.SERVICE_NAME = 'production-service';
process.env.PORT = String(SERVICE_PORTS.production);
process.env.RABBITMQ_QUEUE = 'production.events';
if (process.env.DATABASE_URL?.includes('/identity_db')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/identity_db',
    '/production_db',
  );
}

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ProductionModule, {
    serviceName: 'production-service',
  });
}

void bootstrap();
