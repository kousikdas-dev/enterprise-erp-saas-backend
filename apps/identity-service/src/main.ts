import { bootstrapHttpApp } from '@app/common';
import { IdentityModule } from './identity.module';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(IdentityModule, { serviceName: 'identity-service' });
}

void bootstrap();
