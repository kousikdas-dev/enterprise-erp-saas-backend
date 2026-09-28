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
  CreateSalesCreditNoteDto,
  SalesCreditNoteDto,
  SalesCreditNoteListDto,
  ReverseSalesCreditNoteDto,
} from './dto/sales-credit-note.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Sales Credit Notes')
@Controller({ path: 'sales-credit-notes', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesCreditNotesController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_CREATE)
  @ApiOperation({
    summary: 'Create sales credit note',
    description:
      'Creates a standalone DRAFT Accounts Receivable adjustment (price correction, commercial discount after invoicing, billing adjustment, other pure customer-credit adjustment) with no physical goods movement. salesInvoiceId is optional and traceability-only — a standalone Credit Note with no invoice reference is equally valid. Not the same document as a Sales Return / Credit Note (Phase 3.12), which remains the physical-goods return document. Permission: sales-credit-notes.create.',
  })
  @ApiCreatedResponse({ type: SalesCreditNoteDto })
  @ApiConflictResponse({
    description: 'Referenced sales invoice is not SENT, or the computed total is not greater than zero',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalesCreditNoteDto,
    @Req() request: Request,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'POST',
      path: '/api/v1/sales-credit-notes',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_POST)
  @ApiOperation({
    summary: 'Post sales credit note',
    description:
      'DRAFT -> POSTED. Posts the accounting journal (Dr SALES_REVENUE / Cr SALES_DISCOUNT / Dr OUTPUT_TAX / Cr ACCOUNTS_RECEIVABLE). Idempotent if already POSTED. Permission: sales-credit-notes.post.',
  })
  @ApiOkResponse({ type: SalesCreditNoteDto })
  @ApiConflictResponse({ description: 'Only a DRAFT sales credit note can be posted' })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'POST',
      path: `/api/v1/sales-credit-notes/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-posting')
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_POST)
  @ApiOperation({
    summary: 'Retry sales credit note accounting posting',
    description:
      'Retries posting the accounting journal for a POSTED credit note whose posting previously failed. No-op if already POSTED. Permission: sales-credit-notes.post.',
  })
  @ApiOkResponse({ type: SalesCreditNoteDto })
  @ApiConflictResponse({ description: 'Only a POSTED sales credit note can have its accounting posting retried' })
  @ApiManagementErrors()
  retryAccountingPosting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'POST',
      path: `/api/v1/sales-credit-notes/${id}/retry-accounting-posting`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/reverse')
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_REVERSE)
  @ApiOperation({
    summary: 'Reverse sales credit note',
    description:
      'POSTED -> REVERSED. Never deletes the document or VOIDs the original journal — creates a separate accounting reversal journal. Idempotent if already REVERSED. Permission: sales-credit-notes.reverse.',
  })
  @ApiOkResponse({ type: SalesCreditNoteDto })
  @ApiConflictResponse({ description: 'Only a POSTED sales credit note can be reversed' })
  @ApiManagementErrors()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseSalesCreditNoteDto,
    @Req() request: Request,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'POST',
      path: `/api/v1/sales-credit-notes/${id}/reverse`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/retry-accounting-reversal')
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_REVERSE)
  @ApiOperation({
    summary: 'Retry sales credit note accounting reversal',
    description:
      'Retries the journal reversal for a REVERSED credit note whose post-reversal accounting attempt failed (still accountingPostingStatus POSTED). A no-op returning the credit note unchanged if already REVERSED. Same permission as reverse. Permission: sales-credit-notes.reverse.',
  })
  @ApiOkResponse({ type: SalesCreditNoteDto })
  @ApiConflictResponse({ description: 'Credit note is not REVERSED, or has no posted journal to reverse' })
  @ApiManagementErrors()
  retryAccountingReversal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'POST',
      path: `/api/v1/sales-credit-notes/${id}/retry-accounting-reversal`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_READ)
  @ApiOperation({
    summary: 'List sales credit notes',
    description: 'Lists standalone sales credit notes in the JWT tenant. Permission: sales-credit-notes.read.',
  })
  @ApiOkResponse({ type: SalesCreditNoteListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SalesCreditNoteListDto> {
    return this.sales.forward<SalesCreditNoteListDto>({
      method: 'GET',
      path: '/api/v1/sales-credit-notes',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_CREDIT_NOTES_READ)
  @ApiOperation({
    summary: 'Get sales credit note',
    description: 'Returns a JWT-tenant sales credit note. Permission: sales-credit-notes.read.',
  })
  @ApiOkResponse({ type: SalesCreditNoteDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesCreditNoteDto> {
    return this.sales.forward<SalesCreditNoteDto>({
      method: 'GET',
      path: `/api/v1/sales-credit-notes/${id}`,
      user,
    });
  }
}
