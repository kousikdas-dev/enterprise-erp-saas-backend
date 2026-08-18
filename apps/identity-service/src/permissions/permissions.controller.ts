import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ActorGuard } from '../auth/actor.guard';
import { PermissionsService } from './permissions.service';

@Controller({ path: 'permissions', version: '1' })
@UseGuards(ActorGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  list() {
    return this.permissions.list();
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissions.getById(id);
  }
}
