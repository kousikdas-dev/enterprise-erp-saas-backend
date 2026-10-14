import { bootstrapHttpApp, resolveServiceDatabaseUrl, SERVICE_PORTS } from '@app/common';
import { ProductionModule } from './production.module';

process.env.SERVICE_NAME = 'production-service';
process.env.PORT = String(SERVICE_PORTS.production);
process.env.RABBITMQ_QUEUE = 'production.events';
resolveServiceDatabaseUrl('production');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ProductionModule, {
    serviceName: 'production-service',
  });
}

void bootstrap();
