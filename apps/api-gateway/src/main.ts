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
      { path: 'rbac/test', method: RequestMethod.GET },
      { path: 'rbac/{*path}', method: RequestMethod.ALL },
      { path: 'tenants', method: RequestMethod.ALL },
      { path: 'tenants/{*path}', method: RequestMethod.ALL },
      { path: 'users', method: RequestMethod.ALL },
      { path: 'users/{*path}', method: RequestMethod.ALL },
    ],
  });
}

void bootstrap();
