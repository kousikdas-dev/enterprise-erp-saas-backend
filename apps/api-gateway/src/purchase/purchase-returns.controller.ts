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
  CreatePurchaseReturnDto,
  PurchaseReturnDto,
  PurchaseReturnListDto,
  ReversePurchaseReturnDto,
} from './dto/purchase-return.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Purchase Returns')
@Controller({ path: 'purchase-returns', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseReturnsController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_CREATE)
  @ApiOperation({
    summary: 'Create purchase return',
    description:
      'Creates a DRAFT purchase return against a POSTED, accounted goods receipt. Quantities are commercial-UOM decimal strings, same unit as the referenced receipt line. Permission: purchase-returns.create.',
  })
  @ApiCreatedResponse({ type: PurchaseReturnDto })
  @ApiConflictResponse({
    description:
      'Goods receipt not posted/accounted, or a line predates Purchase Return support (no captured inventory movement reference)',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseReturnDto,
    @Req() request: Request,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'POST',
      path: '/api/v1/purchase-returns',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/confirm')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_CONFIRM)
  @ApiOperation({
    summary: 'Confirm purchase return',
    description:
      'Applies the return to Inventory, allocates unmatched-receipt/matched-invoice quantity, and posts the accounting journal. Idempotent if already CONFIRMED. Permission: purchase-returns.confirm.',
  })
  @ApiOkResponse({ type: PurchaseReturnDto })
  @ApiConflictResponse({
    description: 'Goods receipt no longer posted/accounted, or return quantity exceeds the returnable quantity',
  })
  @ApiManagementErrors()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'POST',
      path: `/api/v1/purchase-returns/${id}/confirm`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-posting')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_CONFIRM)
  @ApiOperation({
    summary: 'Retry purchase return accounting posting',
    description:
      'Retries posting the accounting journal for a CONFIRMED return whose posting previously failed. No-op if already POSTED. Permission: purchase-returns.confirm.',
  })
  @ApiOkResponse({ type: PurchaseReturnDto })
  @ApiConflictResponse({ description: 'Only a CONFIRMED purchase return can have its accounting posting retried' })
  @ApiManagementErrors()
  retryAccountingPosting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'POST',
      path: `/api/v1/purchase-returns/${id}/retry-accounting-posting`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_REVERSE)
  @ApiOperation({
    summary: 'Reverse purchase return',
    description:
      'Undoes a CONFIRMED return: reverses its Inventory movement, restores the unmatched/matched return-quantity counters (matchedQuantity is never touched), and posts a reversing accounting journal. Idempotent if already REVERSED. Permission: purchase-returns.reverse.',
  })
  @ApiOkResponse({ type: PurchaseReturnDto })
  @ApiConflictResponse({
    description: 'Only a CONFIRMED purchase return can be reversed, or a line has no captured inventory movement reference',
  })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePurchaseReturnDto,
    @Req() request: Request,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'POST',
      path: `/api/v1/purchase-returns/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_REVERSE)
  @ApiOperation({
    summary: 'Retry purchase return accounting reversal',
    description:
      'Retries the journal reversal for a REVERSED return whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the return unchanged if already REVERSED. Same permission as reverse. Permission: purchase-returns.reverse.',
  })
  @ApiOkResponse({ type: PurchaseReturnDto })
  @ApiConflictResponse({ description: 'Return is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'POST',
      path: `/api/v1/purchase-returns/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_READ)
  @ApiOperation({
    summary: 'List purchase returns',
    description: 'Lists purchase returns in the JWT tenant. Permission: purchase-returns.read.',
  })
  @ApiOkResponse({ type: PurchaseReturnListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PurchaseReturnListDto> {
    return this.purchase.forward<PurchaseReturnListDto>({
      method: 'GET',
      path: '/api/v1/purchase-returns',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_RETURNS_READ)
  @ApiOperation({
    summary: 'Get purchase return',
    description: 'Returns a JWT-tenant purchase return. Permission: purchase-returns.read.',
  })
  @ApiOkResponse({ type: PurchaseReturnDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseReturnDto> {
    return this.purchase.forward<PurchaseReturnDto>({
      method: 'GET',
      path: `/api/v1/purchase-returns/${id}`,
      user,
    });
  }
}
