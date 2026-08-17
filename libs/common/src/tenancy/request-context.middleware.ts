import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context';

const TENANT_HEADER = 'x-tenant-id';
const CORRELATION_HEADER = 'x-correlation-id';

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const correlationId =
    headerValue(request.headers[CORRELATION_HEADER]) ?? randomUUID();
  const tenantId = headerValue(request.headers[TENANT_HEADER]);

  response.setHeader(CORRELATION_HEADER, correlationId);

  requestContextStorage.run(
    {
      correlationId,
      tenantId,
    },
    () => next(),
  );
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
