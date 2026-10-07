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
import { DeliveryMethodsService } from './delivery-methods.service';
import {
  CreateDeliveryMethodDto,
  UpdateDeliveryMethodDto,
} from './dto/delivery-method.dto';

@Controller({ path: 'delivery-methods', version: '1' })
@UseGuards(ActorGuard)
export class DeliveryMethodsController {
  constructor(private readonly deliveryMethods: DeliveryMethodsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateDeliveryMethodDto,
    @Req() request: Request,
  ) {
    return this.deliveryMethods.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.deliveryMethods.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryMethods.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryMethodDto,
    @Req() request: Request,
  ) {
    return this.deliveryMethods.update(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }
}
