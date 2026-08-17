import { bootstrapHttpApp, SERVICE_PORTS } from '@app/common';
import { IdentityModule } from './identity.module';

process.env.SERVICE_NAME = 'identity-service';
process.env.PORT = String(SERVICE_PORTS.identity);

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(IdentityModule, { serviceName: 'identity-service' });
}

void bootstrap();
