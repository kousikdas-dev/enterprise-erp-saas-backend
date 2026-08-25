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
  CreateIndustryDto,
  IndustryDto,
  IndustryListDto,
  UpdateIndustryDto,
} from './dto/industry.dto';

@Controller({ path: 'industries', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IndustriesController {
  constructor(
    private readonly masterData: MasterDataForwardService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.INDUSTRIES_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIndustryDto,
    @Req() request: Request,
  ): Promise<IndustryDto> {
    return this.masterData.forward<IndustryDto>({
      method: 'POST',
      path: '/api/v1/industries',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INDUSTRIES_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IndustryListDto> {
    return this.masterData.forward<IndustryListDto>({
      method: 'GET',
      path: '/api/v1/industries',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INDUSTRIES_READ)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IndustryDto> {
    return this.masterData.forward<IndustryDto>({
      method: 'GET',
      path: `/api/v1/industries/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INDUSTRIES_UPDATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIndustryDto,
    @Req() request: Request,
  ): Promise<IndustryDto> {
    return this.masterData.forward<IndustryDto>({
      method: 'PATCH',
      path: `/api/v1/industries/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}