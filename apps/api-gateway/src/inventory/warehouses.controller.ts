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
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseDto,
  WarehouseListDto,
} from './dto/warehouse.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Warehouses')
@Controller({ path: 'warehouses', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WarehousesController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.WAREHOUSES_CREATE)
  @ApiOperation({
    summary: 'Create warehouse',
    description:
      'Creates a warehouse in the JWT tenant. Permission: warehouses.create.',
  })
  @ApiCreatedResponse({ type: WarehouseDto })
  @ApiConflictResponse({
    description: 'Warehouse code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWarehouseDto,
    @Req() request: Request,
  ): Promise<WarehouseDto> {
    return this.inventory.forward<WarehouseDto>({
      method: 'POST',
      path: '/api/v1/warehouses',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.WAREHOUSES_READ)
  @ApiOperation({
    summary: 'List warehouses',
    description:
      'Lists warehouses in the JWT tenant. Permission: warehouses.read.',
  })
  @ApiOkResponse({ type: WarehouseListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<WarehouseListDto> {
    return this.inventory.forward<WarehouseListDto>({
      method: 'GET',
      path: '/api/v1/warehouses',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.WAREHOUSES_READ)
  @ApiOperation({
    summary: 'Get warehouse',
    description: 'Returns a JWT-tenant warehouse. Permission: warehouses.read.',
  })
  @ApiOkResponse({ type: WarehouseDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WarehouseDto> {
    return this.inventory.forward<WarehouseDto>({
      method: 'GET',
      path: `/api/v1/warehouses/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.WAREHOUSES_UPDATE)
  @ApiOperation({
    summary: 'Update warehouse',
    description:
      'Updates a JWT-tenant warehouse. Permission: warehouses.update.',
  })
  @ApiOkResponse({ type: WarehouseDto })
  @ApiConflictResponse({
    description: 'Warehouse code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @Req() request: Request,
  ): Promise<WarehouseDto> {
    return this.inventory.forward<WarehouseDto>({
      method: 'PATCH',
      path: `/api/v1/warehouses/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
