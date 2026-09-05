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
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { TaxCodesService } from './tax-codes.service';
import {
  CreateTaxCodeDto,
  UpdateTaxCodeDto,
  UpdateTaxCodeStatusDto,
} from './dto/tax-code.dto';

@Controller({ path: 'tax-codes', version: '1' })
@UseGuards(ActorGuard)
export class TaxCodesController {
  constructor(private readonly taxCodes: TaxCodesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateTaxCodeDto,
    @Req() request: Request,
  ) {
    return this.taxCodes.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.taxCodes.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taxCodes.getById(actor, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeStatusDto,
    @Req() request: Request,
  ) {
    return this.taxCodes.updateStatus(actor, id, dto, requestAuditMeta(request));
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeDto,
    @Req() request: Request,
  ) {
    return this.taxCodes.update(actor, id, dto, requestAuditMeta(request));
  }
}
