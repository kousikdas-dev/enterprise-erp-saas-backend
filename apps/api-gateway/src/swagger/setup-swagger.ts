import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DEFAULT_API_VERSION } from '@app/common';

export const GATEWAY_SWAGGER_PATH = 'api/docs';
export const GATEWAY_SWAGGER_JSON_PATH = 'api/docs-json';
export const SWAGGER_BEARER_AUTH_NAME = 'bearer';

export function setupGatewaySwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Enterprise ERP SaaS API')
    .setDescription(
      'API documentation for the Enterprise ERP SaaS platform. OpenAPI covers API version 1 (`/api/v1`). Only implemented gateway routes are listed. Use Authorize with an Identity JWT access token for future protected operations.',
    )
    .setVersion(`${DEFAULT_API_VERSION}.0`)
    .addServer('/api', 'API version 1 (URI prefix /api/v1)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description:
          'JWT access token. Header: Authorization: Bearer <access-token>',
      },
      SWAGGER_BEARER_AUTH_NAME,
    )
    .addTag('health', 'Liveness and readiness')
    .addTag('Authentication', 'Login and token operations')
    .addTag('Tenants', 'Tenant administration')
    .addTag('Users', 'User administration')
    .addTag('Roles', 'Role administration')
    .addTag('Permissions', 'Permission catalog')
    .addTag('Inventory', 'Items, stock, and warehouses')
    .addTag('Sales', 'Sales orders and invoices')
    .addTag('Accounting', 'General ledger and financial postings')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(GATEWAY_SWAGGER_PATH, app, document, {
    jsonDocumentUrl: GATEWAY_SWAGGER_JSON_PATH,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
    },
  });
}
