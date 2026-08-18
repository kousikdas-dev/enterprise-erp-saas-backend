import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SWAGGER_BEARER_AUTH_NAME } from '../swagger/setup-swagger';
import { RbacTestDto } from './dto/rbac-test.dto';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';

@ApiTags('RBAC')
@Controller({ path: 'rbac', version: '1' })
export class RbacTestController {
  @Get('test')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('rbac.test')
  @ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
  @ApiOperation({
    summary: 'RBAC probe',
    description:
      'Requires a valid access JWT and the rbac.test permission. Tenant comes from the JWT only.',
  })
  @ApiOkResponse({ type: RbacTestDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Authenticated but missing rbac.test' })
  test(@CurrentUser() user: AuthenticatedUser): RbacTestDto {
    return {
      authorized: true,
      userId: user.userId,
      tenantId: user.tenantId,
    };
  }
}
