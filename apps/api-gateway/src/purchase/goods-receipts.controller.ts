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
