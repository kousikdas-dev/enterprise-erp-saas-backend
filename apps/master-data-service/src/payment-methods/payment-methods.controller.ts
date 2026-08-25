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
import { PaymentMethodsService } from './payment-methods.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from './dto/payment-method.dto';

@Controller({ path: 'payment-methods', version: '1' })
@UseGuards(ActorGuard)
export class PaymentMethodsController {
  constructor(
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePaymentMethodDto,
    @Req() request: Request,
  ) {
    return this.paymentMethods.create(
      actor,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.paymentMethods.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentMethods.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @Req() request: Request,
  ) {
    return this.paymentMethods.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}