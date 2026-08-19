import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  CreateShipmentDto,
  ShipmentDto,
  ShipmentListDto,
} from './dto/shipment.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Shipments')
@Controller({ path: 'shipments', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShipmentsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SHIPMENTS_CREATE)
  @ApiOperation({
    summary: 'Create shipment',
    description:
      'Creates a shipment (PENDING_STOCK then posts stock via Inventory). Partial shipments allowed. Exact Inventory replay returns POSTED. Permission: shipments.create.',
  })
  @ApiCreatedResponse({ type: ShipmentDto })
  @ApiConflictResponse({
    description:
      'Order not shippable, over-shipment, insufficient stock, or Inventory payload mismatch',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateShipmentDto,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: '/api/v1/shipments',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_POST)
  @ApiOperation({
    summary: 'Post / finalize shipment',
    description:
      'Retries Inventory application and finalizes a PENDING_STOCK shipment using the same Shipment UUID. Idempotent if already POSTED. Permission: shipments.post.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiConflictResponse({ description: 'Inventory payload mismatch' })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'POST',
      path: `/api/v1/shipments/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({
    summary: 'List shipments',
    description:
      'Lists shipments in the JWT tenant. Permission: shipments.read.',
  })
  @ApiOkResponse({ type: ShipmentListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ShipmentListDto> {
    return this.sales.forward<ShipmentListDto>({
      method: 'GET',
      path: '/api/v1/shipments',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({
    summary: 'Get shipment',
    description: 'Returns a JWT-tenant shipment. Permission: shipments.read.',
  })
  @ApiOkResponse({ type: ShipmentDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ShipmentDto> {
    return this.sales.forward<ShipmentDto>({
      method: 'GET',
      path: `/api/v1/shipments/${id}`,
      user,
    });
  }
}
