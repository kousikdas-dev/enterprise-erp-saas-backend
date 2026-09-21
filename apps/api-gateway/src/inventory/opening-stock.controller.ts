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
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { headerString } from '../identity/header-string';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  AddOpeningStockLineDto,
  CreateOpeningStockDto,
  OpeningStockDto,
  OpeningStockListDto,
  OpeningStockQueryDto,
  ReverseOpeningStockDto,
  UpdateOpeningStockDto,
} from './dto/opening-stock.dto';
import { InventoryForwardService } from './inventory-forward.service';

function definedQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  );
}

@ApiTags('Opening Stock')
@Controller({ path: 'opening-stock', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpeningStockController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_CREATE)
  @ApiOperation({
    summary: 'Create an opening stock document',
    description:
      'Creates a DRAFT opening stock document, optionally with initial lines. Permission: opening-stock.create.',
  })
  @ApiCreatedResponse({ type: OpeningStockDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOpeningStockDto,
    @Req() request: Request,
  ): Promise<OpeningStockDto> {
    return this.inventory.forward<OpeningStockDto>({
      method: 'POST',
      path: '/api/v1/opening-stock',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_READ)
  @ApiOperation({
    summary: 'List opening stock documents',
    description:
      'Lists tenant-scoped opening stock documents. Optional status/productId/warehouseId/effectiveFrom/effectiveTo filters. Permission: opening-stock.read.',
  })
  @ApiOkResponse({ type: OpeningStockListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OpeningStockQueryDto,
  ): Promise<OpeningStockListDto> {
    return this.inventory.forward<OpeningStockListDto>({
      method: 'GET',
      path: '/api/v1/opening-stock',
      user,
      query: definedQuery({ ...query }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_READ)
  @ApiOperation({
    summary: 'Get an opening stock document',
    description: 'Permission: opening-stock.read.',
  })
  @ApiOkResponse({ type: OpeningStockDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OpeningStockDto> {
    return this.inventory.forward<OpeningStockDto>({
      method: 'GET',
      path: `/api/v1/opening-stock/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_CREATE)
  @ApiOperation({
    summary: 'Update a DRAFT opening stock document',
    description: 'Editable only while DRAFT. Permission: opening-stock.create.',
  })
  @ApiOkResponse({ type: OpeningStockDto })
  @ApiConflictResponse({ description: 'Document is not editable once posted' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpeningStockDto,
  ): Promise<OpeningStockDto> {
    return this.inventory.forward<OpeningStockDto>({
      method: 'PATCH',
      path: `/api/v1/opening-stock/${id}`,
      user,
      body: { ...dto },
    });
  }

  @Post(':id/lines')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_CREATE)
  @ApiOperation({
    summary: 'Add a line to a DRAFT opening stock document',
    description:
      'unitOfMeasureId must be the product\'s base unit or a configured alternate unit. Permission: opening-stock.create.',
  })
  @ApiCreatedResponse({ type: OpeningStockDto })
  @ApiConflictResponse({
    description: 'Document not editable, duplicate product+warehouse line, or invalid unit of measure',
  })
  @ApiManagementErrors()
  addLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOpeningStockLineDto,
  ): Promise<OpeningStockDto> {
    return this.inventory.forward<OpeningStockDto>({
      method: 'POST',
      path: `/api/v1/opening-stock/${id}/lines`,
      user,
      body: { ...dto },
    });
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_CREATE)
  @ApiOperation({
    summary: 'Remove a line from a DRAFT opening stock document',
    description: 'Permission: opening-stock.create.',
  })
  @ApiOkResponse({ type: OpeningStockDto })
  @ApiManagementErrors()
  removeLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ): Promise<OpeningStockDto> {
    return this.inventory.forward<OpeningStockDto>({
      method: 'DELETE',
      path: `/api/v1/opening-stock/${id}/lines/${lineId}`,
      user,
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_POST)
  @ApiOperation({
    summary: 'Post an opening stock document',
    description:
      'Creates one OPENING StockMovement per line and updates Stock. Hard-blocked if any line already has non-zero stock (OPENING_BLOCKED_EXISTING_STOCK) or an active opening already covers that product+warehouse (OPENING_DUPLICATE_ACTIVE) — no bypass. Idempotent: reposting an already-POSTED document returns 200 with code OPENING_ALREADY_POSTED and creates nothing new. Permission: opening-stock.post.',
  })
  @ApiCreatedResponse({ type: OpeningStockDto })
  @ApiOkResponse({ type: OpeningStockDto, description: 'Idempotent replay (OPENING_ALREADY_POSTED)' })
  @ApiConflictResponse({
    description: 'OPENING_BLOCKED_EXISTING_STOCK, OPENING_DUPLICATE_ACTIVE, or OPENING_ALREADY_REVERSED',
  })
  @ApiManagementErrors()
  async post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OpeningStockDto> {
    const result = await this.inventory.forward<OpeningStockDto>({
      method: 'POST',
      path: `/api/v1/opening-stock/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
    response.status(
      result.code === 'OPENING_ALREADY_POSTED' ? HttpStatus.OK : HttpStatus.CREATED,
    );
    return result;
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.OPENING_STOCK_REVERSE)
  @ApiOperation({
    summary: 'Reverse a POSTED opening stock document',
    description:
      'Creates an ADJUSTMENT_OUT reversal movement per line. Hard-blocked (OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY) if any affected product+warehouse has had any stock movement since this document was posted — no bypass. Idempotent: re-reversing an already-REVERSED document returns 200 with code OPENING_ALREADY_REVERSED and creates nothing new. Permission: opening-stock.reverse.',
  })
  @ApiCreatedResponse({ type: OpeningStockDto })
  @ApiOkResponse({ type: OpeningStockDto, description: 'Idempotent replay (OPENING_ALREADY_REVERSED)' })
  @ApiConflictResponse({
    description: 'OPENING_NOT_POSTED or OPENING_REVERSAL_BLOCKED_SUBSEQUENT_ACTIVITY',
  })
  @ApiManagementErrors()
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseOpeningStockDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OpeningStockDto> {
    const result = await this.inventory.forward<OpeningStockDto>({
      method: 'POST',
      path: `/api/v1/opening-stock/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
    response.status(
      result.code === 'OPENING_ALREADY_REVERSED' ? HttpStatus.OK : HttpStatus.CREATED,
    );
    return result;
  }
}
