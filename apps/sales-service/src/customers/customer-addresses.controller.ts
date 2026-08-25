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
import { CustomerAddressesService } from './customer-addresses.service';
import {
  CreateCustomerAddressDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';

@Controller({
  path: 'customers/:customerId/addresses',
  version: '1',
})
@UseGuards(ActorGuard)
export class CustomerAddressesController {
  constructor(
    private readonly addresses: CustomerAddressesService,
  ) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerAddressDto,
    @Req() request: Request,
  ) {
    return this.addresses.create(
      actor,
      customerId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.addresses.list(actor, customerId);
  }

  @Patch(':addressId')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
    @Req() request: Request,
  ) {
    return this.addresses.update(
      actor,
      customerId,
      addressId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':addressId')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Req() request: Request,
  ) {
    return this.addresses.remove(
      actor,
      customerId,
      addressId,
      requestAuditMeta(request),
    );
  }
}