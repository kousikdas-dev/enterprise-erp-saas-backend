import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { ApiManagementErrors } from './api-management-errors';
import { PermissionDto, PermissionListDto } from './dto/permission.dto';
import { IdentityForwardService } from './identity-forward.service';

@ApiTags('Permissions')
@Controller({ path: 'permissions', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly identity: IdentityForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({
    summary: 'List permission catalog',
    description:
      'Read-only global permission catalog. There is no create endpoint. Permission: permissions.read.',
  })
  @ApiOkResponse({ type: PermissionListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PermissionListDto> {
    return this.identity.forward<PermissionListDto>({
      method: 'GET',
      path: '/api/v1/permissions',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PERMISSIONS_READ)
  @ApiOperation({
    summary: 'Get permission',
    description:
      'Returns one catalog permission by id. Permission: permissions.read.',
  })
  @ApiOkResponse({ type: PermissionDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PermissionDto> {
    return this.identity.forward<PermissionDto>({
      method: 'GET',
      path: `/api/v1/permissions/${id}`,
      user,
    });
  }
}
