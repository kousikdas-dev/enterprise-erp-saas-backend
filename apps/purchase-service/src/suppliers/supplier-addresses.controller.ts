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
import { SupplierAddressesService } from './supplier-addresses.service';
import {
  CreateSupplierAddressDto,
  UpdateSupplierAddressDto,
} from './dto/supplier-address.dto';

@Controller({
  path: 'suppliers/:supplierId/addresses',
  version: '1',
})
@UseGuards(ActorGuard)
export class SupplierAddressesController {
  constructor(private readonly addresses: SupplierAddressesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateSupplierAddressDto,
    @Req() request: Request,
  ) {
    return this.addresses.create(
      actor,
      supplierId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
  ) {
    return this.addresses.list(actor, supplierId);
  }

  @Patch(':addressId')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateSupplierAddressDto,
    @Req() request: Request,
  ) {
    return this.addresses.update(
      actor,
      supplierId,
      addressId,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':addressId')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Req() request: Request,
  ) {
    return this.addresses.remove(
      actor,
      supplierId,
      addressId,
      requestAuditMeta(request),
    );
  }
}
