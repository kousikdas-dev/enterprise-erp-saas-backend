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
import { PERMISSIONS } from '@app/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { headerString } from '../identity/header-string';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { MasterDataForwardService } from './master-data-forward.service';
import {
  CreatePaymentTermDto,
  PaymentTermDto,
  PaymentTermListDto,
  UpdatePaymentTermDto,
} from './dto/payment-term.dto';

@Controller({ path: 'payment-terms', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentTermsController {
  constructor(
    private readonly masterData: MasterDataForwardService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PAYMENT_TERMS_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentTermDto,
    @Req() request: Request,
  ): Promise<PaymentTermDto> {
    return this.masterData.forward<PaymentTermDto>({
      method: 'POST',
      path: '/api/v1/payment-terms',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PAYMENT_TERMS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentTermListDto> {
    return this.masterData.forward<PaymentTermListDto>({
      method: 'GET',
      path: '/api/v1/payment-terms',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_TERMS_READ)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentTermDto> {
    return this.masterData.forward<PaymentTermDto>({
      method: 'GET',
      path: `/api/v1/payment-terms/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PAYMENT_TERMS_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentTermDto,
    @Req() request: Request,
  ): Promise<PaymentTermDto> {
    return this.masterData.forward<PaymentTermDto>({
      method: 'PATCH',
      path: `/api/v1/payment-terms/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}