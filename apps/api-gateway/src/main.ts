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
      { path: 'roles', method: RequestMethod.ALL },
      { path: 'roles/{*path}', method: RequestMethod.ALL },
      { path: 'permissions', method: RequestMethod.ALL },
      { path: 'permissions/{*path}', method: RequestMethod.ALL },
      { path: 'products', method: RequestMethod.ALL },
      { path: 'products/{*path}', method: RequestMethod.ALL },
      { path: 'categories', method: RequestMethod.ALL },
      { path: 'categories/{*path}', method: RequestMethod.ALL },
      { path: 'units', method: RequestMethod.ALL },
      { path: 'units/{*path}', method: RequestMethod.ALL },
      { path: 'warehouses', method: RequestMethod.ALL },
      { path: 'warehouses/{*path}', method: RequestMethod.ALL },
      { path: 'stock', method: RequestMethod.ALL },
      { path: 'stock/{*path}', method: RequestMethod.ALL },
      { path: 'stock-adjustments', method: RequestMethod.ALL },
      { path: 'stock-adjustments/{*path}', method: RequestMethod.ALL },
      { path: 'stock-movements', method: RequestMethod.ALL },
      { path: 'stock-movements/{*path}', method: RequestMethod.ALL },
      { path: 'suppliers', method: RequestMethod.ALL },
      { path: 'suppliers/{*path}', method: RequestMethod.ALL },
      { path: 'purchase-orders', method: RequestMethod.ALL },
      { path: 'purchase-orders/{*path}', method: RequestMethod.ALL },
      { path: 'goods-receipts', method: RequestMethod.ALL },
      { path: 'goods-receipts/{*path}', method: RequestMethod.ALL },
      { path: 'customers', method: RequestMethod.ALL },
      { path: 'customers/{*path}', method: RequestMethod.ALL },
      { path: 'quotations', method: RequestMethod.ALL },
      { path: 'quotations/{*path}', method: RequestMethod.ALL },
      { path: 'proforma-invoices', method: RequestMethod.ALL },
      { path: 'proforma-invoices/{*path}', method: RequestMethod.ALL },
      { path: 'sales-orders', method: RequestMethod.ALL },
      { path: 'sales-orders/{*path}', method: RequestMethod.ALL },
      { path: 'shipments', method: RequestMethod.ALL },
      { path: 'shipments/{*path}', method: RequestMethod.ALL },
    ],
  });
}

void bootstrap();
