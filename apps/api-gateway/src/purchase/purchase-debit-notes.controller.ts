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
  CreatePurchaseDebitNoteDto,
  PurchaseDebitNoteDto,
  PurchaseDebitNoteListDto,
  ReversePurchaseDebitNoteDto,
} from './dto/purchase-debit-note.dto';
import { PurchaseForwardService } from './purchase-forward.service';

@ApiTags('Purchase Debit Notes')
@Controller({ path: 'purchase-debit-notes', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseDebitNotesController {
  constructor(private readonly purchase: PurchaseForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_CREATE)
  @ApiOperation({
    summary: 'Create purchase debit note',
    description:
      'Creates a standalone DRAFT Accounts Payable adjustment (price correction, quality claim, commercial rebate, short supply claim, other supplier financial adjustment) with no physical goods movement. purchaseInvoiceId is optional and traceability-only — a standalone Debit Note with no invoice reference is equally valid. Permission: purchase-debit-notes.create.',
  })
  @ApiCreatedResponse({ type: PurchaseDebitNoteDto })
  @ApiConflictResponse({
    description: 'Referenced purchase invoice is not CONFIRMED, or the computed total is not greater than zero',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseDebitNoteDto,
    @Req() request: Request,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'POST',
      path: '/api/v1/purchase-debit-notes',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_POST)
  @ApiOperation({
    summary: 'Post purchase debit note',
    description:
      'DRAFT -> POSTED. Posts the accounting journal (Dr ACCOUNTS_PAYABLE / Cr PURCHASE_EXPENSE / Cr INPUT_TAX). Idempotent if already POSTED. Permission: purchase-debit-notes.post.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteDto })
  @ApiConflictResponse({ description: 'Only a DRAFT purchase debit note can be posted' })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'POST',
      path: `/api/v1/purchase-debit-notes/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-posting')
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_POST)
  @ApiOperation({
    summary: 'Retry purchase debit note accounting posting',
    description:
      'Retries posting the accounting journal for a POSTED debit note whose posting previously failed. No-op if already POSTED. Permission: purchase-debit-notes.post.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteDto })
  @ApiConflictResponse({ description: 'Only a POSTED purchase debit note can have its accounting posting retried' })
  @ApiManagementErrors()
  retryAccountingPosting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'POST',
      path: `/api/v1/purchase-debit-notes/${id}/retry-accounting-posting`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_REVERSE)
  @ApiOperation({
    summary: 'Reverse purchase debit note',
    description:
      'POSTED -> REVERSED. Never deletes the document or VOIDs the original journal — creates a separate accounting reversal journal. Idempotent if already REVERSED. Permission: purchase-debit-notes.reverse.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteDto })
  @ApiConflictResponse({ description: 'Only a POSTED purchase debit note can be reversed' })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePurchaseDebitNoteDto,
    @Req() request: Request,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'POST',
      path: `/api/v1/purchase-debit-notes/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_REVERSE)
  @ApiOperation({
    summary: 'Retry purchase debit note accounting reversal',
    description:
      'Retries the journal reversal for a REVERSED debit note whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the debit note unchanged if already REVERSED. Same permission as reverse. Permission: purchase-debit-notes.reverse.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteDto })
  @ApiConflictResponse({ description: 'Debit note is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'POST',
      path: `/api/v1/purchase-debit-notes/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_READ)
  @ApiOperation({
    summary: 'List purchase debit notes',
    description: 'Lists purchase debit notes in the JWT tenant. Permission: purchase-debit-notes.read.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PurchaseDebitNoteListDto> {
    return this.purchase.forward<PurchaseDebitNoteListDto>({
      method: 'GET',
      path: '/api/v1/purchase-debit-notes',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASE_DEBIT_NOTES_READ)
  @ApiOperation({
    summary: 'Get purchase debit note',
    description: 'Returns a JWT-tenant purchase debit note. Permission: purchase-debit-notes.read.',
  })
  @ApiOkResponse({ type: PurchaseDebitNoteDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseDebitNoteDto> {
    return this.purchase.forward<PurchaseDebitNoteDto>({
      method: 'GET',
      path: `/api/v1/purchase-debit-notes/${id}`,
      user,
    });
  }
}
