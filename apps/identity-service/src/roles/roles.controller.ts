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
import { ActorContext } from '../audit/audit.types';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller({ path: 'roles', version: '1' })
@UseGuards(ActorGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateRoleDto,
    @Req() request: Request,
  ) {
    return this.roles.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.roles.list(actor);
  }

  @Post(':id/permissions')
  assignPermission(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionDto,
    @Req() request: Request,
  ) {
    return this.roles.assignPermission(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }

  @Delete(':id/permissions/:permissionId')
  removePermission(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @Req() request: Request,
  ) {
    return this.roles.removePermission(
      actor,
      id,
      permissionId,
      requestAuditMeta(request),
    );
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roles.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: Request,
  ) {
    return this.roles.update(actor, id, dto, requestAuditMeta(request));
  }
}
