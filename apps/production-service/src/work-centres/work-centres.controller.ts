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
import { CreateWorkCentreDto, UpdateWorkCentreDto } from './dto/work-centre.dto';
import { WorkCentresService } from './work-centres.service';

@Controller({ path: 'work-centres', version: '1' })
@UseGuards(ActorGuard)
export class WorkCentresController {
  constructor(private readonly workCentres: WorkCentresService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateWorkCentreDto,
  ) {
    return this.workCentres.create(actor, dto);
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.workCentres.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workCentres.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkCentreDto,
  ) {
    return this.workCentres.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workCentres.remove(actor, id);
  }

  @Post(':id/activate')
  activate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workCentres.activate(actor, id);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workCentres.deactivate(actor, id);
  }
}
