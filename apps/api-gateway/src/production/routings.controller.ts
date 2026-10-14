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
  Query,
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
  CreateRoutingDto,
  RoutingDto,
  RoutingListDto,
  UpdateRoutingDto,
} from './dto/routing.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Production Routing')
@Controller({ path: 'production/routings', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoutingsController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_CREATE)
  @ApiOperation({
    summary: 'Create a Manufacturing Routing',
    description:
      'Creates a DRAFT routing at the next version for the given product, with an ordered list of operation/work-centre steps. Permission: production-routings.create.',
  })
  @ApiCreatedResponse({ type: RoutingDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoutingDto,
    @Req() request: Request,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'POST',
      path: '/api/v1/routings',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_READ)
  @ApiOperation({
    summary: 'List Routings',
    description:
      'Lists routings in the JWT tenant, optionally filtered to a single product (all its versions). Permission: production-routings.read.',
  })
  @ApiOkResponse({ type: RoutingListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productId') productId?: string,
  ): Promise<RoutingListDto> {
    return this.production.forward<RoutingListDto>({
      method: 'GET',
      path: '/api/v1/routings',
      user,
      query: productId ? { productId } : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_READ)
  @ApiOperation({
    summary: 'Get a Routing',
    description: 'Returns a JWT-tenant routing. Permission: production-routings.read.',
  })
  @ApiOkResponse({ type: RoutingDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'GET',
      path: `/api/v1/routings/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_UPDATE)
  @ApiOperation({
    summary: 'Update a Routing',
    description: 'Updates a DRAFT routing only. Permission: production-routings.update.',
  })
  @ApiOkResponse({ type: RoutingDto })
  @ApiConflictResponse({ description: 'Routing is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutingDto,
    @Req() request: Request,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'PATCH',
      path: `/api/v1/routings/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_DELETE)
  @ApiOperation({
    summary: 'Delete a Routing',
    description: 'Deletes a DRAFT routing only. Permission: production-routings.delete.',
  })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'Routing is not DRAFT' })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ id: string; removed: boolean }> {
    return this.production.forward<{ id: string; removed: boolean }>({
      method: 'DELETE',
      path: `/api/v1/routings/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_ACTIVATE)
  @ApiOperation({
    summary: 'Activate a Routing',
    description:
      'Marks this routing version ACTIVE (requires at least one step) and deactivates any other ACTIVE version of the same product. Permission: production-routings.activate.',
  })
  @ApiOkResponse({ type: RoutingDto })
  @ApiConflictResponse({ description: 'Routing cannot be activated' })
  @ApiManagementErrors()
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'POST',
      path: `/api/v1/routings/${id}/activate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_DEACTIVATE)
  @ApiOperation({
    summary: 'Deactivate a Routing',
    description: 'Marks an ACTIVE routing INACTIVE. Permission: production-routings.deactivate.',
  })
  @ApiOkResponse({ type: RoutingDto })
  @ApiConflictResponse({ description: 'Routing cannot be deactivated' })
  @ApiManagementErrors()
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'POST',
      path: `/api/v1/routings/${id}/deactivate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/new-version')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ROUTINGS_CREATE)
  @ApiOperation({
    summary: 'Create a new Routing version',
    description:
      'Clones this routing (header + steps) into a new DRAFT at the next version for the same product. Permission: production-routings.create.',
  })
  @ApiCreatedResponse({ type: RoutingDto })
  @ApiManagementErrors()
  createNewVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<RoutingDto> {
    return this.production.forward<RoutingDto>({
      method: 'POST',
      path: `/api/v1/routings/${id}/new-version`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
