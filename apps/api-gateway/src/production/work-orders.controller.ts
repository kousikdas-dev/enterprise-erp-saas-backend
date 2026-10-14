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
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  WorkOrderDto,
  WorkOrderListDto,
} from './dto/work-order.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Work Orders')
@Controller({ path: 'production/work-orders', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkOrdersController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Create a work order',
    description:
      'Creates a PENDING work order against a production order, assigned to an active Operation and Work Centre. Permission: production-work-orders.create.',
  })
  @ApiCreatedResponse({ type: WorkOrderDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkOrderDto,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: '/api/v1/work-orders',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_READ)
  @ApiOperation({
    summary: 'List work orders',
    description:
      'Lists work orders in the JWT tenant, optionally filtered by production order, work centre, status, or search. Permission: production-work-orders.read.',
  })
  @ApiOkResponse({ type: WorkOrderListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productionOrderId') productionOrderId?: string,
    @Query('workCentreId') workCentreId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<WorkOrderListDto> {
    const query: Record<string, string> = {};
    if (productionOrderId) query.productionOrderId = productionOrderId;
    if (workCentreId) query.workCentreId = workCentreId;
    if (status) query.status = status;
    if (search) query.search = search;
    if (page) query.page = page;
    if (pageSize) query.pageSize = pageSize;
    return this.production.forward<WorkOrderListDto>({
      method: 'GET',
      path: '/api/v1/work-orders',
      user,
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_READ)
  @ApiOperation({
    summary: 'Get a work order',
    description: 'Returns a JWT-tenant work order. Permission: production-work-orders.read.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'GET',
      path: `/api/v1/work-orders/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_UPDATE)
  @ApiOperation({
    summary: 'Update a work order',
    description:
      'Updates a work order (operation, work centre, sequence, planned duration, schedule, notes). Not allowed once DONE or CANCELLED. Permission: production-work-orders.update.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'A DONE or CANCELLED work order cannot be edited' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'PATCH',
      path: `/api/v1/work-orders/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_DELETE)
  @ApiOperation({
    summary: 'Delete a work order',
    description: 'Deletes a PENDING work order only. Permission: production-work-orders.delete.',
  })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'Only PENDING work orders can be deleted' })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ id: string; removed: boolean }> {
    return this.production.forward<{ id: string; removed: boolean }>({
      method: 'DELETE',
      path: `/api/v1/work-orders/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_START)
  @ApiOperation({
    summary: 'Start a work order',
    description: 'PENDING -> IN_PROGRESS. Permission: production-work-orders.start.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'Only PENDING work orders can be started' })
  @ApiManagementErrors()
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: `/api/v1/work-orders/${id}/start`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/block')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_BLOCK)
  @ApiOperation({
    summary: 'Block a work order',
    description: 'IN_PROGRESS -> BLOCKED. Permission: production-work-orders.block.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'Only IN_PROGRESS work orders can be blocked' })
  @ApiManagementErrors()
  block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: `/api/v1/work-orders/${id}/block`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/unblock')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_UNBLOCK)
  @ApiOperation({
    summary: 'Unblock a work order',
    description: 'BLOCKED -> IN_PROGRESS. Permission: production-work-orders.unblock.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'Only BLOCKED work orders can be unblocked' })
  @ApiManagementErrors()
  unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: `/api/v1/work-orders/${id}/unblock`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_COMPLETE)
  @ApiOperation({
    summary: 'Complete a work order',
    description: 'IN_PROGRESS/BLOCKED -> DONE. Permission: production-work-orders.complete.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'Only IN_PROGRESS or BLOCKED work orders can be completed' })
  @ApiManagementErrors()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: `/api/v1/work-orders/${id}/complete`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PRODUCTION_WORK_ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel a work order',
    description: 'Allowed from PENDING, IN_PROGRESS, or BLOCKED only. Permission: production-work-orders.cancel.',
  })
  @ApiOkResponse({ type: WorkOrderDto })
  @ApiConflictResponse({ description: 'Work order cannot be cancelled from its current status' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<WorkOrderDto> {
    return this.production.forward<WorkOrderDto>({
      method: 'POST',
      path: `/api/v1/work-orders/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
