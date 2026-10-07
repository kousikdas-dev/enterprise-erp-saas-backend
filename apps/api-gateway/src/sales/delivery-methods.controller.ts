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
  CreateDeliveryMethodDto,
  DeliveryMethodDto,
  DeliveryMethodListDto,
  UpdateDeliveryMethodDto,
} from './dto/delivery-method.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Delivery Methods')
@Controller({ path: 'delivery-methods', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeliveryMethodsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.DELIVERY_METHODS_CREATE)
  @ApiOperation({
    summary: 'Create delivery method',
    description:
      'Creates a delivery method in the JWT tenant. Permission: delivery-methods.create.',
  })
  @ApiCreatedResponse({ type: DeliveryMethodDto })
  @ApiConflictResponse({
    description: 'Delivery method code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeliveryMethodDto,
    @Req() request: Request,
  ): Promise<DeliveryMethodDto> {
    return this.sales.forward<DeliveryMethodDto>({
      method: 'POST',
      path: '/api/v1/delivery-methods',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.DELIVERY_METHODS_READ)
  @ApiOperation({
    summary: 'List delivery methods',
    description:
      'Lists delivery methods in the JWT tenant. Permission: delivery-methods.read.',
  })
  @ApiOkResponse({ type: DeliveryMethodListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeliveryMethodListDto> {
    return this.sales.forward<DeliveryMethodListDto>({
      method: 'GET',
      path: '/api/v1/delivery-methods',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_METHODS_READ)
  @ApiOperation({
    summary: 'Get delivery method',
    description:
      'Returns a JWT-tenant delivery method. Permission: delivery-methods.read.',
  })
  @ApiOkResponse({ type: DeliveryMethodDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryMethodDto> {
    return this.sales.forward<DeliveryMethodDto>({
      method: 'GET',
      path: `/api/v1/delivery-methods/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DELIVERY_METHODS_UPDATE)
  @ApiOperation({
    summary: 'Update delivery method',
    description:
      'Updates a JWT-tenant delivery method. Permission: delivery-methods.update.',
  })
  @ApiOkResponse({ type: DeliveryMethodDto })
  @ApiConflictResponse({
    description: 'Delivery method code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryMethodDto,
    @Req() request: Request,
  ): Promise<DeliveryMethodDto> {
    return this.sales.forward<DeliveryMethodDto>({
      method: 'PATCH',
      path: `/api/v1/delivery-methods/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
