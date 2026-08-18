import { bootstrapHttpApp } from '@app/common';
import { RequestMethod } from '@nestjs/common';
import { ApiGatewayModule } from './api-gateway.module';
import { setupGatewaySwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  await bootstrapHttpApp(ApiGatewayModule, {
    serviceName: 'api-gateway',
    configureSwagger: setupGatewaySwagger,
    globalPrefixExcludes: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'auth/login', method: RequestMethod.POST },
      { path: 'auth/me', method: RequestMethod.GET },
      { path: 'auth/{*path}', method: RequestMethod.ALL },
    ],
  });
}

void bootstrap();
