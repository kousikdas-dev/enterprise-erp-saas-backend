import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SWAGGER_BEARER_AUTH_NAME } from '../swagger/setup-swagger';

export function ApiManagementErrors(): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
    ApiForbiddenResponse({
      description: 'Authenticated but missing permission',
    }),
    ApiBadRequestResponse({ description: 'Validation failed' }),
    ApiNotFoundResponse({ description: 'Resource not found in this tenant' }),
  );
}
