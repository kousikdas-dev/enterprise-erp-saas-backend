import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { AccountMappingsService } from './account-mappings.service';
import {
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
} from './dto/account-mapping.dto';

@Controller({ path: 'account-mappings', version: '1' })
@UseGuards(ActorGuard)
export class AccountMappingsController {
  constructor(private readonly mappings: AccountMappingsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateAccountMappingDto,
    @Req() request: Request,
  ) {
    return this.mappings.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.mappings.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mappings.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountMappingDto,
    @Req() request: Request,
  ) {
    return this.mappings.update(actor, id, dto, requestAuditMeta(request));
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.mappings.remove(actor, id, requestAuditMeta(request));
  }
}
