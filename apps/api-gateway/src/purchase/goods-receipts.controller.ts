import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
  CreateGoodsReceiptDto,
  GoodsReceiptDto,
  GoodsReceiptListDto,
  ReverseGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Goods Receipts')
@Controller({ path: 'goods-receipts', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GoodsReceiptsController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_CREATE)
  @ApiOperation({
    summary: 'Create goods receipt',
    description:
      'Creates a goods receipt (PENDING_STOCK then posts stock via Inventory). One warehouse per receipt. Exact Inventory replay returns POSTED. Permission: goods-receipts.create.',
  })
  @ApiCreatedResponse({ type: GoodsReceiptDto })
  @ApiConflictResponse({
    description: 'PO not receivable, over-receipt, or Inventory payload mismatch',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGoodsReceiptDto,
    @Req() request: Request,
  ): Promise<GoodsReceiptDto> {
    return this.purchase.forward<GoodsReceiptDto>({
      method: 'POST',
      path: '/api/v1/goods-receipts',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_CREATE)
  @ApiOperation({
    summary: 'Post / finalize goods receipt',
    description:
      'Retries Inventory application and finalizes a PENDING_STOCK receipt using the same GoodsReceipt UUID. Idempotent if already POSTED. Permission: goods-receipts.create.',
  })
  @ApiOkResponse({ type: GoodsReceiptDto })
  @ApiConflictResponse({ description: 'Inventory payload mismatch' })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<GoodsReceiptDto> {
    return this.purchase.forward<GoodsReceiptDto>({
      method: 'POST',
      path: `/api/v1/goods-receipts/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_REVERSE)
  @ApiOperation({
    summary: 'Reverse goods receipt',
    description:
      'Undoes a POSTED receipt in full: reverses its Inventory movement(s), restores PurchaseOrderItem.receivedQuantity and PurchaseOrder.status, and reverses the GRNI journal. Only permitted when zero downstream activity exists (no Purchase Invoice match, no unmatched or matched Purchase Return). Idempotent if already REVERSED. Permission: goods-receipts.reverse.',
  })
  @ApiOkResponse({ type: GoodsReceiptDto })
  @ApiConflictResponse({
    description:
      'Only a POSTED goods receipt can be reversed, a line has downstream activity, has no captured inventory movement reference, or the received quantity has since been consumed elsewhere (insufficient stock)',
  })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseGoodsReceiptDto,
    @Req() request: Request,
  ): Promise<GoodsReceiptDto> {
    return this.purchase.forward<GoodsReceiptDto>({
      method: 'POST',
      path: `/api/v1/goods-receipts/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_REVERSE)
  @ApiOperation({
    summary: 'Retry goods receipt accounting reversal',
    description:
      'Retries the GRNI journal reversal for a REVERSED receipt whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the receipt unchanged if already REVERSED. Same permission as reverse. Permission: goods-receipts.reverse.',
  })
  @ApiOkResponse({ type: GoodsReceiptDto })
  @ApiConflictResponse({ description: 'Receipt is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<GoodsReceiptDto> {
    return this.purchase.forward<GoodsReceiptDto>({
      method: 'POST',
      path: `/api/v1/goods-receipts/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_READ)
  @ApiOperation({
    summary: 'List goods receipts',
    description:
      'Lists goods receipts in the JWT tenant. Permission: goods-receipts.read.',
  })
  @ApiOkResponse({ type: GoodsReceiptListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<GoodsReceiptListDto> {
    return this.purchase.forward<GoodsReceiptListDto>({
      method: 'GET',
      path: '/api/v1/goods-receipts',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.GOODS_RECEIPTS_READ)
  @ApiOperation({
    summary: 'Get goods receipt',
    description:
      'Returns a JWT-tenant goods receipt. Permission: goods-receipts.read.',
  })
  @ApiOkResponse({ type: GoodsReceiptDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GoodsReceiptDto> {
    return this.purchase.forward<GoodsReceiptDto>({
      method: 'GET',
      path: `/api/v1/goods-receipts/${id}`,
      user,
    });
  }
}
