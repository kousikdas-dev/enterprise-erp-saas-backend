import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ActorContext } from '../auth/actor-context';
import { ActorGuard } from '../auth/actor.guard';
import { CurrentActor } from '../auth/current-actor.decorator';
import { requestAuditMeta } from '../http/request-audit-meta';
import {
  AddOpeningStockLineDto,
  CreateOpeningStockDto,
  OpeningStockQueryDto,
  ReverseOpeningStockDto,
  UpdateOpeningStockDto,
} from './dto/opening-stock.dto';
import { OpeningStockService } from './opening-stock.service';

@Controller({ path: 'opening-stock', version: '1' })
@UseGuards(ActorGuard)
export class OpeningStockController {
  constructor(private readonly openingStock: OpeningStockService) {}

  @Post()
  create(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateOpeningStockDto,
    @Req() request: Request,
  ) {
    return this.openingStock.create(actor, dto, requestAuditMeta(request));
  }

  @Get()
  list(@CurrentActor() actor: ActorContext, @Query() query: OpeningStockQueryDto) {
    return this.openingStock.list(actor, query);
  }

  @Get(':id')
  getById(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.openingStock.getById(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpeningStockDto,
  ) {
    return this.openingStock.update(actor, id, dto);
  }

  @Post(':id/lines')
  @HttpCode(HttpStatus.CREATED)
  addLine(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOpeningStockLineDto,
  ) {
    return this.openingStock.addLine(actor, id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.openingStock.removeLine(actor, id, lineId);
  }

  @Post(':id/post')
  async post(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.openingStock.post(actor, id, requestAuditMeta(request));
    response.status(
      'code' in result && result.code === 'OPENING_ALREADY_POSTED'
        ? HttpStatus.OK
        : HttpStatus.CREATED,
    );
    return result;
  }

  @Post(':id/reverse')
  async reverse(
    @CurrentActor() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseOpeningStockDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.openingStock.reverse(
      actor,
      id,
      dto,
      requestAuditMeta(request),
    );
    response.status(
      'code' in result && result.code === 'OPENING_ALREADY_REVERSED'
        ? HttpStatus.OK
        : HttpStatus.CREATED,
    );
    return result;
  }
}
