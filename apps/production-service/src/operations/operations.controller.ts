import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto';
import { OperationsService } from './operations.service';

@Controller({ path: 'operations', version: '1' })
@UseGuards(ActorGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post()
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateOperationDto) {
    return this.operations.create(actor, dto);
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.operations.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationDto,
  ) {
    return this.operations.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.remove(actor, id);
  }

  @Post(':id/activate')
  activate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.activate(actor, id);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.deactivate(actor, id);
  }
}
