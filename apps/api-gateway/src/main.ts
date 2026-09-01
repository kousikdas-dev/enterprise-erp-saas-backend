import { bootstrapHttpApp } from '@app/common';
import { ApiGatewayModule } from './api-gateway.module';
import { GLOBAL_PREFIX_EXCLUDES } from './bootstrap/global-prefix';
import { setupGatewaySwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ApiGatewayModule, {
    serviceName: 'api-gateway',
    configureSwagger: setupGatewaySwagger,
    globalPrefixExcludes: GLOBAL_PREFIX_EXCLUDES,
  });
}

void bootstrap();
