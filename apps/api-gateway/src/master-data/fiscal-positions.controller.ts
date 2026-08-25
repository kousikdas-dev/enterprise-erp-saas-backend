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
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { headerString } from '../identity/header-string';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { MasterDataForwardService } from './master-data-forward.service';
import {
  CreateFiscalPositionDto,
  FiscalPositionDto,
  FiscalPositionListDto,
  UpdateFiscalPositionDto,
} from './dto/fiscal-position.dto';

@Controller({ path: 'fiscal-positions', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FiscalPositionsController {
  constructor(
    private readonly masterData: MasterDataForwardService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.FISCAL_POSITIONS_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFiscalPositionDto,
    @Req() request: Request,
  ): Promise<FiscalPositionDto> {
    return this.masterData.forward<FiscalPositionDto>({
      method: 'POST',
      path: '/api/v1/fiscal-positions',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.FISCAL_POSITIONS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FiscalPositionListDto> {
    return this.masterData.forward<FiscalPositionListDto>({
      method: 'GET',
      path: '/api/v1/fiscal-positions',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.FISCAL_POSITIONS_READ)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FiscalPositionDto> {
    return this.masterData.forward<FiscalPositionDto>({
      method: 'GET',
      path: `/api/v1/fiscal-positions/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FISCAL_POSITIONS_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalPositionDto,
    @Req() request: Request,
  ): Promise<FiscalPositionDto> {
    return this.masterData.forward<FiscalPositionDto>({
      method: 'PATCH',
      path: `/api/v1/fiscal-positions/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}