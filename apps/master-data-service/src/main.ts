import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { MasterDataModule } from './master-data.module';

process.env.SERVICE_NAME = 'master-data-service';
process.env.PORT = String(SERVICE_PORTS.masterData);
process.env.RABBITMQ_QUEUE = 'master-data.events';

if (process.env.DATABASE_URL?.includes('/identity_db')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/identity_db',
    '/master_data_db',
  );
}

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(MasterDataModule, {
    serviceName: 'master-data-service',
  });
}

void bootstrap();
