import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { ReversePurchaseReturnDto } from './dto/reverse-purchase-return.dto';
import { PurchaseReturnsService } from './purchase-returns.service';

@Controller({ path: 'purchase-returns', version: '1' })
@UseGuards(ActorGuard)
export class PurchaseReturnsController {
  constructor(private readonly returns: PurchaseReturnsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePurchaseReturnDto,
    @Req() request: Request,
  ) {
    return this.returns.create(actor, dto, requestAuditMeta(request));
  }

  @Post(':id/confirm')
  confirm(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.returns.confirm(actor, id, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-posting')
  retryAccountingPosting(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.returns.retryAccountingPosting(
      actor,
      id,
      requestAuditMeta(request),
    );
  }

  @Post(':id/reverse')
  reverse(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePurchaseReturnDto,
    @Req() request: Request,
  ) {
    return this.returns.reverse(actor, id, dto, requestAuditMeta(request));
  }

  @Post(':id/retry-accounting-reversal')
  retryAccountingReversal(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.returns.retryAccountingReversal(
      actor,
      id,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.returns.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.getById(actor, id);
  }
}
