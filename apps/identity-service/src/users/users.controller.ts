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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ActorContext } from '../audit/audit.types';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
@UseGuards(ActorGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ) {
    return this.users.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.users.list(actor, query);
  }

  @Post(':id/roles')
  assignRole(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
    @Req() request: Request,
  ) {
    return this.users.assignRole(
      actor,
      id,
      dto.roleId,
      requestAuditMeta(request),
    );
  }

  @Delete(':id/roles/:roleId')
  removeRole(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() request: Request,
  ) {
    return this.users.removeRole(actor, id, roleId, requestAuditMeta(request));
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.getById(actor, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: Request,
  ) {
    return this.users.updateStatus(actor, id, dto, requestAuditMeta(request));
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    return this.users.update(actor, id, dto, requestAuditMeta(request));
  }
}
