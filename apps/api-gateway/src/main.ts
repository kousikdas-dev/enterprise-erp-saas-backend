import { bootstrapHttpApp } from '@app/common';
import { ApiGatewayModule } from './api-gateway.module';
import { setupGatewaySwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ApiGatewayModule, {
    serviceName: 'api-gateway',
    configureSwagger: setupGatewaySwagger,
  });
}

void bootstrap();
