import {
  Body,
  Controller,
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
import { AccountLedgerQueryDto } from './ledger/account-ledger.dto';
import { AccountLedgerService } from './ledger/account-ledger.service';

@Controller({ path: 'accounts', version: '1' })
@UseGuards(ActorGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: AccountLedgerService,
  ) {}

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

  @Get(':id/ledger')
  getLedger(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AccountLedgerQueryDto,
  ) {
    return this.ledger.getLedger(actor, id, query);
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
