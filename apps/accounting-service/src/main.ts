import { bootstrapHttpApp } from '@app/common';
import { AccountingModule } from './accounting.module';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(AccountingModule, {
    serviceName: 'accounting-service',
  });
}

void bootstrap();
