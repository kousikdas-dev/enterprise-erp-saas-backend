import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { BillOfMaterialsService } from './bill-of-materials.service';
import { CreateBomDto, UpdateBomDto } from './dto/bom.dto';

@Controller({ path: 'boms', version: '1' })
@UseGuards(ActorGuard)
export class BillOfMaterialsController {
  constructor(private readonly boms: BillOfMaterialsService) {}

  @Post()
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateBomDto) {
    return this.boms.create(actor, dto);
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query('parentProductId') parentProductId?: string,
  ) {
    return this.boms.list(actor, parentProductId);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.boms.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
  ) {
    return this.boms.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.boms.remove(actor, id);
  }

  @Post(':id/activate')
  activate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.boms.activate(actor, id);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.boms.deactivate(actor, id);
  }

  @Post(':id/new-version')
  createNewVersion(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.boms.createNewVersion(actor, id);
  }
}
