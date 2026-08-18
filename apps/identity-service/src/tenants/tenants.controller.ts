import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentActor } from '../auth/current-actor.decorator';
import { ActorGuard } from '../auth/actor.guard';
import { ActorContext } from '../audit/audit.types';
import { requestAuditMeta } from '../http/request-audit-meta';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller({ path: 'tenants', version: '1' })
@UseGuards(ActorGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateTenantDto,
    @Req() request: Request,
  ) {
    return this.tenants.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.tenants.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tenants.getById(actor, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
    @Req() request: Request,
  ) {
    return this.tenants.updateStatus(actor, id, dto, requestAuditMeta(request));
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @Req() request: Request,
  ) {
    return this.tenants.update(actor, id, dto, requestAuditMeta(request));
  }
}
