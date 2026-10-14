import { bootstrapHttpApp, resolveServiceDatabaseUrl } from '@app/common';
import { AccountingModule } from './accounting.module';

resolveServiceDatabaseUrl('accounting');

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(AccountingModule, {
    serviceName: 'accounting-service',
  });
}

void bootstrap();
