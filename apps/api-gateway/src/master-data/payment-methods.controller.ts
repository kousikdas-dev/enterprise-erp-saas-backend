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
import { Request } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { headerString } from '../identity/header-string';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { SWAGGER_BEARER_AUTH_NAME } from '../swagger/setup-swagger';
import { MasterDataForwardService } from './master-data-forward.service';
import {
  CreatePaymentMethodDto,
  PaymentMethodDto,
  PaymentMethodListDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

@ApiBearerAuth(SWAGGER_BEARER_AUTH_NAME)
@Controller({ path: 'payment-methods', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentMethodsController {
  constructor(
    private readonly masterData: MasterDataForwardService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PAYMENT_METHODS_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentMethodDto,
    @Req() request: Request,
  ): Promise<PaymentMethodDto> {
    return this.masterData.forward<PaymentMethodDto>({
      method: 'POST',
      path: '/api/v1/payment-methods',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYMENT_METHODS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentMethodListDto> {
    return this.masterData.forward<PaymentMethodListDto>({
      method: 'GET',
      path: '/api/v1/payment-methods',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_METHODS_READ)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentMethodDto> {
    return this.masterData.forward<PaymentMethodDto>({
      method: 'GET',
      path: `/api/v1/payment-methods/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_METHODS_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @Req() request: Request,
  ): Promise<PaymentMethodDto> {
    return this.masterData.forward<PaymentMethodDto>({
      method: 'PATCH',
      path: `/api/v1/payment-methods/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}