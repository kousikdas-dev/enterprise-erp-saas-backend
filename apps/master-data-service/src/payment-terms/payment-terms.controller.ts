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
import { PaymentTermsService } from './payment-terms.service';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
} from './dto/payment-term.dto';

@Controller({ path: 'payment-terms', version: '1' })
@UseGuards(ActorGuard)
export class PaymentTermsController {
  constructor(private readonly paymentTerms: PaymentTermsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePaymentTermDto,
    @Req() request: Request,
  ) {
    return this.paymentTerms.create(
      actor,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.paymentTerms.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentTerms.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentTermDto,
    @Req() request: Request,
  ) {
    return this.paymentTerms.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}
