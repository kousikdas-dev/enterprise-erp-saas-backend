import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
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
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { headerString } from '../identity/header-string';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  CreateStockAdjustmentDto,
  StockAdjustmentResultDto,
  StockListDto,
  StockMovementDto,
  StockMovementListDto,
  StockMovementQueryDto,
  StockQueryDto,
} from './dto/stock.dto';
import { InventoryForwardService } from './inventory-forward.service';

function definedQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  );
}

@ApiTags('Stock')
@Controller({ version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Get('stock')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({
    summary: 'List stock balances',
    description:
      'Lists tenant-scoped stock. Optional productId and warehouseId filters. Permission: stock.read.',
  })
  @ApiOkResponse({ type: StockListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StockQueryDto,
  ): Promise<StockListDto> {
    return this.inventory.forward<StockListDto>({
      method: 'GET',
      path: '/api/v1/stock',
      user,
      query: definedQuery({ ...query }),
    });
  }

  @Get('stock-movements')
  @RequirePermissions(PERMISSIONS.STOCK_MOVEMENTS_READ)
  @ApiTags('Stock Movements')
  @ApiOperation({
    summary: 'List stock movements',
    description:
      'Lists tenant-scoped movements. Filters: productId, warehouseId, type, from, to. Permission: stock.movements.read.',
  })
  @ApiOkResponse({ type: StockMovementListDto })
  @ApiManagementErrors()
  listMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StockMovementQueryDto,
  ): Promise<StockMovementListDto> {
    return this.inventory.forward<StockMovementListDto>({
      method: 'GET',
      path: '/api/v1/stock-movements',
      user,
      query: definedQuery({ ...query }),
    });
  }

  @Get('stock-movements/:id')
  @RequirePermissions(PERMISSIONS.STOCK_MOVEMENTS_READ)
  @ApiTags('Stock Movements')
  @ApiOperation({
    summary: 'Get stock movement',
    description:
      'Returns a JWT-tenant stock movement. Permission: stock.movements.read.',
  })
  @ApiOkResponse({ type: StockMovementDto })
  @ApiManagementErrors()
  getMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockMovementDto> {
    return this.inventory.forward<StockMovementDto>({
      method: 'GET',
      path: `/api/v1/stock-movements/${id}`,
      user,
    });
  }

  @Post('stock-adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST)
  @ApiTags('Stock Adjustments')
  @ApiOperation({
    summary: 'Adjust stock',
    description:
      'Creates a stock movement and updates stock atomically. Types: OPENING, ADJUSTMENT_IN, ADJUSTMENT_OUT. Quantity must be positive. Negative resulting stock is rejected. Permission: stock.adjust.',
  })
  @ApiCreatedResponse({ type: StockAdjustmentResultDto })
  @ApiConflictResponse({ description: 'Insufficient stock' })
  @ApiManagementErrors()
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockAdjustmentDto,
    @Req() request: Request,
  ): Promise<StockAdjustmentResultDto> {
    return this.inventory.forward<StockAdjustmentResultDto>({
      method: 'POST',
      path: '/api/v1/stock-adjustments',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
