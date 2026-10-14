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
import { CreateRoutingDto, UpdateRoutingDto } from './dto/routing.dto';
import { RoutingsService } from './routings.service';

@Controller({ path: 'routings', version: '1' })
@UseGuards(ActorGuard)
export class RoutingsController {
  constructor(private readonly routings: RoutingsService) {}

  @Post()
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateRoutingDto) {
    return this.routings.create(actor, dto);
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query('productId') productId?: string,
  ) {
    return this.routings.list(actor, productId);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routings.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutingDto,
  ) {
    return this.routings.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routings.remove(actor, id);
  }

  @Post(':id/activate')
  activate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routings.activate(actor, id);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routings.deactivate(actor, id);
  }

  @Post(':id/new-version')
  createNewVersion(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routings.createNewVersion(actor, id);
  }
}
