import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { headerString } from '../identity/header-string';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  CreateOperationDto,
  OperationDto,
  OperationListDto,
  UpdateOperationDto,
} from './dto/operation.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Production Operations')
@Controller({ path: 'production/operations', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_CREATE)
  @ApiOperation({
    summary: 'Create an operation',
    description:
      'Creates an Operation Master record in the JWT tenant. Permission: production-operations.create.',
  })
  @ApiCreatedResponse({ type: OperationDto })
  @ApiConflictResponse({
    description: 'Operation code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOperationDto,
    @Req() request: Request,
  ): Promise<OperationDto> {
    return this.production.forward<OperationDto>({
      method: 'POST',
      path: '/api/v1/operations',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_READ)
  @ApiOperation({
    summary: 'List operations',
    description:
      'Lists Operation Master records in the JWT tenant. Permission: production-operations.read.',
  })
  @ApiOkResponse({ type: OperationListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<OperationListDto> {
    return this.production.forward<OperationListDto>({
      method: 'GET',
      path: '/api/v1/operations',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_READ)
  @ApiOperation({
    summary: 'Get an operation',
    description: 'Returns a JWT-tenant operation. Permission: production-operations.read.',
  })
  @ApiOkResponse({ type: OperationDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperationDto> {
    return this.production.forward<OperationDto>({
      method: 'GET',
      path: `/api/v1/operations/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_UPDATE)
  @ApiOperation({
    summary: 'Update an operation',
    description:
      'Updates a JWT-tenant operation. Permission: production-operations.update.',
  })
  @ApiOkResponse({ type: OperationDto })
  @ApiConflictResponse({
    description: 'Operation code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationDto,
    @Req() request: Request,
  ): Promise<OperationDto> {
    return this.production.forward<OperationDto>({
      method: 'PATCH',
      path: `/api/v1/operations/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_DELETE)
  @ApiOperation({
    summary: 'Delete an operation',
    description: 'Deletes a JWT-tenant operation. Permission: production-operations.delete.',
  })
  @ApiOkResponse()
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ id: string; removed: boolean }> {
    return this.production.forward<{ id: string; removed: boolean }>({
      method: 'DELETE',
      path: `/api/v1/operations/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_ACTIVATE)
  @ApiOperation({
    summary: 'Activate an operation',
    description:
      'Marks this operation ACTIVE so it is selectable in future routing. Permission: production-operations.activate.',
  })
  @ApiOkResponse({ type: OperationDto })
  @ApiConflictResponse({ description: 'Operation is already active' })
  @ApiManagementErrors()
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<OperationDto> {
    return this.production.forward<OperationDto>({
      method: 'POST',
      path: `/api/v1/operations/${id}/activate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_OPERATIONS_DEACTIVATE)
  @ApiOperation({
    summary: 'Deactivate an operation',
    description:
      'Marks this operation INACTIVE. Existing references keep resolving; only new selection is blocked. Permission: production-operations.deactivate.',
  })
  @ApiOkResponse({ type: OperationDto })
  @ApiConflictResponse({ description: 'Operation is already inactive' })
  @ApiManagementErrors()
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<OperationDto> {
    return this.production.forward<OperationDto>({
      method: 'POST',
      path: `/api/v1/operations/${id}/deactivate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
