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
  ApiNotImplementedResponse,
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
  CreateProductionOrderDto,
  ProductionOrderDto,
  ProductionOrderListDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Production Orders')
@Controller({ path: 'production/production-orders', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionOrdersController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CREATE)
  @ApiOperation({
    summary: 'Create a production order',
    description:
      'Creates a DRAFT production order for the given product, validated against an ACTIVE BOM of that product. Permission: production-orders.create.',
  })
  @ApiCreatedResponse({ type: ProductionOrderDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductionOrderDto,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: '/api/v1/production-orders',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_READ)
  @ApiOperation({
    summary: 'List production orders',
    description:
      'Lists production orders in the JWT tenant with search, status/date filters, and pagination. Permission: production-orders.read.',
  })
  @ApiOkResponse({ type: ProductionOrderListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ProductionOrderListDto> {
    const query: Record<string, string> = {};
    if (search) query.search = search;
    if (status) query.status = status;
    if (dateFrom) query.dateFrom = dateFrom;
    if (dateTo) query.dateTo = dateTo;
    if (page) query.page = page;
    if (pageSize) query.pageSize = pageSize;
    return this.production.forward<ProductionOrderListDto>({
      method: 'GET',
      path: '/api/v1/production-orders',
      user,
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_READ)
  @ApiOperation({
    summary: 'Get a production order',
    description: 'Returns a JWT-tenant production order. Permission: production-orders.read.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'GET',
      path: `/api/v1/production-orders/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_UPDATE)
  @ApiOperation({
    summary: 'Update a production order',
    description:
      'Updates a production order. Product/BOM/planned quantity/output UOM are editable only while DRAFT; other fields (warehouse, priority, dates, notes) remain editable through IN_PROGRESS. Permission: production-orders.update.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Field not editable in the order\'s current status' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionOrderDto,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'PATCH',
      path: `/api/v1/production-orders/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_DELETE)
  @ApiOperation({
    summary: 'Delete a production order',
    description:
      'Deletes a DRAFT production order only; production orders are ERP transactions and are never physically deletable once planned. Permission: production-orders.delete.',
  })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'Only DRAFT production orders can be deleted' })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ id: string; removed: boolean }> {
    return this.production.forward<{ id: string; removed: boolean }>({
      method: 'DELETE',
      path: `/api/v1/production-orders/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/plan')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_PLAN)
  @ApiOperation({
    summary: 'Plan a production order',
    description: 'DRAFT -> PLANNED, re-validating product and BOM. Permission: production-orders.plan.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Only DRAFT production orders can be planned' })
  @ApiManagementErrors()
  plan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/plan`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/release')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_RELEASE)
  @ApiOperation({
    summary: 'Release a production order',
    description:
      'PLANNED -> RELEASED, authorizing production to begin. Permission: production-orders.release.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Only PLANNED production orders can be released' })
  @ApiManagementErrors()
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/release`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_START)
  @ApiOperation({
    summary: 'Start a production order',
    description: 'RELEASED -> IN_PROGRESS. Permission: production-orders.start.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Only RELEASED production orders can be started' })
  @ApiManagementErrors()
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/start`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_COMPLETE)
  @ApiOperation({
    summary: 'Complete a production order',
    description:
      'Not yet available: completion requires Production Receipt (produced/scrap/rejected quantities), which is not implemented in this phase. Permission: production-orders.complete.',
  })
  @ApiNotImplementedResponse({
    description: 'Completion requires Production Receipt, which is not implemented yet',
  })
  @ApiConflictResponse({ description: 'Only IN_PROGRESS production orders can be completed' })
  @ApiManagementErrors()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/complete`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel a production order',
    description:
      'Allowed from DRAFT, PLANNED, or RELEASED only. Permission: production-orders.cancel.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Production order cannot be cancelled from its current status' })
  @ApiManagementErrors()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/cancel`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.PRODUCTION_ORDERS_CLOSE)
  @ApiOperation({
    summary: 'Close a production order',
    description:
      'Administrative finalization, allowed only from COMPLETED or CANCELLED. Permission: production-orders.close.',
  })
  @ApiOkResponse({ type: ProductionOrderDto })
  @ApiConflictResponse({ description: 'Only COMPLETED or CANCELLED production orders can be closed' })
  @ApiManagementErrors()
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProductionOrderDto> {
    return this.production.forward<ProductionOrderDto>({
      method: 'POST',
      path: `/api/v1/production-orders/${id}/close`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
