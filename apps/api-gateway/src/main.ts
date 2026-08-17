import { bootstrapHttpApp } from '@app/common';
import { ApiGatewayModule } from './api-gateway.module';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ApiGatewayModule, {
    serviceName: 'api-gateway',
    enableSwagger: true,
  });
}

void bootstrap();
