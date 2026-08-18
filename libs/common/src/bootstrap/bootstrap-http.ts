import {
  INestApplication,
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DEFAULT_API_PREFIX, DEFAULT_API_VERSION } from '../constants';
import { AllExceptionsFilter } from '../http/http-exception.filter';
import { ResponseInterceptor } from '../http/response.interceptor';
import { requestContextMiddleware } from '../tenancy/request-context.middleware';

export interface HttpBootstrapOptions {
  serviceName: string;
  configureSwagger?: (app: INestApplication) => void;
  globalPrefixExcludes?: Array<{ path: string; method: RequestMethod }>;
}

export async function bootstrapHttpApp(
  module: unknown,
  options: HttpBootstrapOptions,
): Promise<void> {
  const app = await NestFactory.create(module as never, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.use(
    helmet({
      contentSecurityPolicy: options.configureSwagger ? false : undefined,
    }),
  );
  app.enableCors();
  app.enableShutdownHooks();
  app.use(requestContextMiddleware);

  app.setGlobalPrefix(DEFAULT_API_PREFIX, {
    exclude: options.globalPrefixExcludes ?? [
      { path: 'health', method: RequestMethod.GET },
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

  options.configureSwagger?.(app);

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  const logger = new Logger(options.serviceName);
  logger.log(`${options.serviceName} listening on port ${port}`);
  if (options.configureSwagger) {
    logger.log(`Swagger UI available at http://localhost:${port}/api/docs`);
  }
}
