import { Logger, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DEFAULT_API_PREFIX, DEFAULT_API_VERSION } from '../constants';
import { AllExceptionsFilter } from '../http/http-exception.filter';
import { ResponseInterceptor } from '../http/response.interceptor';
import { requestContextMiddleware } from '../tenancy/request-context.middleware';

export interface HttpBootstrapOptions {
  serviceName: string;
  enableSwagger?: boolean;
}

export async function bootstrapHttpApp(
  module: unknown,
  options: HttpBootstrapOptions,
): Promise<void> {
  const app = await NestFactory.create(module as never, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.use(
    helmet({
      contentSecurityPolicy: options.enableSwagger ? false : undefined,
    }),
  );
  app.enableCors();
  app.enableShutdownHooks();
  app.use(requestContextMiddleware);

  app.setGlobalPrefix(DEFAULT_API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'docs', method: RequestMethod.GET },
      { path: 'docs-json', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  if (options.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP API Gateway')
      .setDescription(
        'Enterprise ERP/SaaS API. Domain services are reached through this gateway.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'x-tenant-id', in: 'header' },
        'tenant-id',
      )
      .addTag('health', 'Liveness and readiness')
      .addTag('identity', 'Identity, auth, tenants, users, RBAC')
      .addTag('sales', 'Sales orders and invoices')
      .addTag('inventory', 'Items, stock, and warehouses')
      .addTag('accounting', 'General ledger and financial postings')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs-json',
    });
  }

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  const logger = new Logger(options.serviceName);
  logger.log(`${options.serviceName} listening on port ${port}`);
  if (options.enableSwagger) {
    logger.log(`Swagger UI available at http://localhost:${port}/docs`);
  }
}
