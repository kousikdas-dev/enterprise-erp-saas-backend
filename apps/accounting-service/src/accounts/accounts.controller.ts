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
import { AccountsService } from './accounts.service';
import {
  CreateAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from './dto/account.dto';

@Controller({ path: 'accounts', version: '1' })
@UseGuards(ActorGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateAccountDto,
    @Req() request: Request,
  ) {
    return this.accounts.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext) {
    return this.accounts.list(actor);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.getById(actor, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountStatusDto,
    @Req() request: Request,
  ) {
    return this.accounts.updateStatus(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @Req() request: Request,
  ) {
    return this.accounts.update(actor, id, dto, requestAuditMeta(request));
  }
}
