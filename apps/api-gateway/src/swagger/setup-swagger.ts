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
      'API documentation for the Enterprise ERP SaaS platform. OpenAPI covers API version 1 (`/v1`). Only implemented gateway routes are listed. Use Authorize with an Identity JWT access token for future protected operations.',
    )
    .setVersion(`${DEFAULT_API_VERSION}.0`)
    .addServer('http://localhost:3000', 'Local API Gateway')
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
    .addTag('RBAC', 'Role-based access control probes')
    .addTag('Tenants', 'Tenant administration')
    .addTag('Users', 'User administration')
    .addTag('Roles', 'Role administration')
    .addTag('Role Permissions', 'Assign catalog permissions to tenant roles')
    .addTag('User Roles', 'Assign tenant roles to users')
    .addTag('Permissions', 'Global permission catalog (read-only)')
    .addTag('Products', 'Inventory products')
    .addTag('Categories', 'Product categories')
    .addTag('Units', 'Units of measure')
    .addTag('Warehouses', 'Warehouses')
    .addTag('Stock', 'Stock balances')
    .addTag('Stock Adjustments', 'Stock quantity adjustments')
    .addTag('Stock Movements', 'Stock movement history')
    .addTag('Suppliers', 'Purchase suppliers')
    .addTag('Purchase Orders', 'Purchase orders')
    .addTag('Goods Receipts', 'Goods receipts and stock posting')
    .addTag('Customers', 'Sales customers')
    .addTag('Quotations', 'Sales quotations')
    .addTag('Proforma Invoices', 'Sales proforma invoices')
    .addTag('Sales Orders', 'Sales orders')
    .addTag('Shipments', 'Sales shipments and stock posting')
    .addTag('Accounting', 'General ledger and financial postings')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: true,
  });

  SwaggerModule.setup(GATEWAY_SWAGGER_PATH, app, document, {
    jsonDocumentUrl: GATEWAY_SWAGGER_JSON_PATH,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
    },
  });
}
