import { RequestMethod } from '@nestjs/common';

/**
 * Routes excluded from the API Gateway's global 'api' prefix (applied via
 * app.setGlobalPrefix in main.ts). Everything else keeps the prefix, so its
 * real URL is /api/v{version}/<path>. Swagger document generation
 * (see ../swagger/setup-swagger.ts) derives its per-route path from this same
 * list so "Try it out" always targets the real Gateway URL instead of
 * guessing that every route has (or lacks) the prefix.
 */
export const GLOBAL_PREFIX_EXCLUDES: Array<{
  path: string;
  method: RequestMethod;
}> = [
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
];

const EXCLUDED_SEGMENTS = new Set(
  GLOBAL_PREFIX_EXCLUDES.map((entry) => entry.path.split('/')[0]),
);

const VERSION_SEGMENT_PATTERN = /^v\d+$/i;

/** True when a top-level resource segment (e.g. 'customers') keeps no global prefix. */
export function isExcludedFromGlobalPrefix(resourceSegment: string): boolean {
  return EXCLUDED_SEGMENTS.has(resourceSegment);
}

/**
 * Resolves the real Gateway URL for a controller-generated path (e.g. the
 * paths NestJS's SwaggerModule builds with ignoreGlobalPrefix: true, which
 * carry the version segment but never the 'api' prefix). Resources excluded
 * from the global prefix are returned unchanged; everything else gets the
 * prefix restored.
 */
export function resolveGatewayPath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const [first, second] = segments;
  const resourceSegment = VERSION_SEGMENT_PATTERN.test(first ?? '')
    ? second
    : first;

  if (!resourceSegment || isExcludedFromGlobalPrefix(resourceSegment)) {
    return path;
  }

  return `/api${path}`;
}
