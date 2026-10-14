import {
  Body,
  Controller,
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
  CreateUnbuildOrderDto,
  UnbuildOrderDto,
  UnbuildOrderListDto,
  UpdateUnbuildOrderDto,
} from './dto/unbuild-order.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Unbuild Orders')
@Controller({ path: 'production/unbuild-orders', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnbuildOrdersController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Create an unbuild order',
    description:
      'Creates a DRAFT unbuild order that will break the given finished-good quantity down into its BOM components. Permission: production-unbuild-orders.create.',
  })
  @ApiCreatedResponse({ type: UnbuildOrderDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUnbuildOrderDto,
    @Req() request: Request,
  ): Promise<UnbuildOrderDto> {
    return this.production.forward<UnbuildOrderDto>({
      method: 'POST',
      path: '/api/v1/unbuild-orders',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ)
  @ApiOperation({
    summary: 'List unbuild orders',
    description:
      'Lists unbuild orders in the JWT tenant, optionally filtered by status or search. Permission: production-unbuild-orders.read.',
  })
  @ApiOkResponse({ type: UnbuildOrderListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<UnbuildOrderListDto> {
    const query: Record<string, string> = {};
    if (status) query.status = status;
    if (search) query.search = search;
    if (page) query.page = page;
    if (pageSize) query.pageSize = pageSize;
    return this.production.forward<UnbuildOrderListDto>({
      method: 'GET',
      path: '/api/v1/unbuild-orders',
      user,
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_READ)
  @ApiOperation({
    summary: 'Get an unbuild order',
    description: 'Returns a JWT-tenant unbuild order. Permission: production-unbuild-orders.read.',
  })
  @ApiOkResponse({ type: UnbuildOrderDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UnbuildOrderDto> {
    return this.production.forward<UnbuildOrderDto>({
      method: 'GET',
      path: `/api/v1/unbuild-orders/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_UPDATE)
  @ApiOperation({
    summary: 'Update an unbuild order',
    description:
      'Updates a DRAFT unbuild order (quantity, warehouse, date, notes). Not allowed once PROCESSING, DONE, or CANCELLED. Permission: production-unbuild-orders.update.',
  })
  @ApiOkResponse({ type: UnbuildOrderDto })
  @ApiConflictResponse({ description: 'Only a DRAFT unbuild order can be edited' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnbuildOrderDto,
    @Req() request: Request,
  ): Promise<UnbuildOrderDto> {
    return this.production.forward<UnbuildOrderDto>({
      method: 'PATCH',
      path: `/api/v1/unbuild-orders/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_COMPLETE)
  @ApiOperation({
    summary: 'Complete an unbuild order',
    description:
      'DRAFT -> PROCESSING -> DONE. Posts the finished-goods issue and component returns to inventory-service. Permission: production-unbuild-orders.complete.',
  })
  @ApiOkResponse({ type: UnbuildOrderDto })
  @ApiConflictResponse({ description: 'Unbuild order is already being completed, not DRAFT, or already finished' })
  @ApiManagementErrors()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<UnbuildOrderDto> {
    return this.production.forward<UnbuildOrderDto>({
      method: 'POST',
      path: `/api/v1/unbuild-orders/${id}/complete`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PRODUCTION_UNBUILD_ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel an unbuild order',
    description: 'Allowed from DRAFT only. Permission: production-unbuild-orders.cancel.',
  })
  @ApiOkResponse({ type: UnbuildOrderDto })
  @ApiConflictResponse({ description: 'Only a DRAFT unbuild order can be cancelled' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<UnbuildOrderDto> {
    return this.production.forward<UnbuildOrderDto>({
      method: 'POST',
      path: `/api/v1/unbuild-orders/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
