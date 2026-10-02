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
  CreateWorkCentreDto,
  UpdateWorkCentreDto,
  WorkCentreDto,
  WorkCentreListDto,
} from './dto/work-centre.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Production Work Centres')
@Controller({ path: 'production/work-centres', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkCentresController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_CREATE)
  @ApiOperation({
    summary: 'Create a work centre',
    description:
      'Creates a Work Centre Master record in the JWT tenant. Permission: production-work-centres.create.',
  })
  @ApiCreatedResponse({ type: WorkCentreDto })
  @ApiConflictResponse({
    description: 'Work centre code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkCentreDto,
    @Req() request: Request,
  ): Promise<WorkCentreDto> {
    return this.production.forward<WorkCentreDto>({
      method: 'POST',
      path: '/api/v1/work-centres',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_READ)
  @ApiOperation({
    summary: 'List work centres',
    description:
      'Lists Work Centre Master records in the JWT tenant. Permission: production-work-centres.read.',
  })
  @ApiOkResponse({ type: WorkCentreListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<WorkCentreListDto> {
    return this.production.forward<WorkCentreListDto>({
      method: 'GET',
      path: '/api/v1/work-centres',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_READ)
  @ApiOperation({
    summary: 'Get a work centre',
    description:
      'Returns a JWT-tenant work centre. Permission: production-work-centres.read.',
  })
  @ApiOkResponse({ type: WorkCentreDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkCentreDto> {
    return this.production.forward<WorkCentreDto>({
      method: 'GET',
      path: `/api/v1/work-centres/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_UPDATE)
  @ApiOperation({
    summary: 'Update a work centre',
    description:
      'Updates a JWT-tenant work centre. Permission: production-work-centres.update.',
  })
  @ApiOkResponse({ type: WorkCentreDto })
  @ApiConflictResponse({
    description: 'Work centre code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkCentreDto,
    @Req() request: Request,
  ): Promise<WorkCentreDto> {
    return this.production.forward<WorkCentreDto>({
      method: 'PATCH',
      path: `/api/v1/work-centres/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_DELETE)
  @ApiOperation({
    summary: 'Delete a work centre',
    description:
      'Deletes a JWT-tenant work centre. Permission: production-work-centres.delete.',
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
      path: `/api/v1/work-centres/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_ACTIVATE)
  @ApiOperation({
    summary: 'Activate a work centre',
    description:
      'Marks this work centre ACTIVE so it is selectable in future routing. Permission: production-work-centres.activate.',
  })
  @ApiOkResponse({ type: WorkCentreDto })
  @ApiConflictResponse({ description: 'Work centre is already active' })
  @ApiManagementErrors()
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkCentreDto> {
    return this.production.forward<WorkCentreDto>({
      method: 'POST',
      path: `/api/v1/work-centres/${id}/activate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_CENTRES_DEACTIVATE)
  @ApiOperation({
    summary: 'Deactivate a work centre',
    description:
      'Marks this work centre INACTIVE. Existing references keep resolving; only new selection is blocked. Permission: production-work-centres.deactivate.',
  })
  @ApiOkResponse({ type: WorkCentreDto })
  @ApiConflictResponse({ description: 'Work centre is already inactive' })
  @ApiManagementErrors()
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkCentreDto> {
    return this.production.forward<WorkCentreDto>({
      method: 'POST',
      path: `/api/v1/work-centres/${id}/deactivate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
