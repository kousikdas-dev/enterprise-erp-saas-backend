import { bootstrapHttpApp, resolveServiceDatabaseUrl, SERVICE_PORTS } from '@app/common';
import { MasterDataModule } from './master-data.module';

process.env.SERVICE_NAME = 'master-data-service';
process.env.PORT = String(SERVICE_PORTS.masterData);
process.env.RABBITMQ_QUEUE = 'master-data.events';
resolveServiceDatabaseUrl('master-data');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(MasterDataModule, {
    serviceName: 'master-data-service',
  });
}

void bootstrap();
