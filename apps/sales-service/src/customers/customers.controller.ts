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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Controller({ path: 'customers', version: '1' })
@UseGuards(ActorGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateCustomerDto,
    @Req() request: Request,
  ) {
    return this.customers.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.customers.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() request: Request,
  ) {
    return this.customers.update(actor, id, dto, requestAuditMeta(request));
  }
}
