import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
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
import { AccountingForwardService } from './accounting-forward.service';
import {
  CreateJournalEntryDto,
  JournalEntryDto,
  JournalEntryListDto,
  UpdateJournalEntryDto,
} from './dto/journal-entry.dto';

@ApiTags('Journal Entries')
@Controller({ path: 'journal-entries', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalEntriesController {
  constructor(private readonly accounting: AccountingForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_CREATE)
  @ApiOperation({
    summary: 'Create journal entry',
    description:
      'Creates a DRAFT journal entry in the JWT tenant. Permission: journal-entries.create.',
  })
  @ApiCreatedResponse({ type: JournalEntryDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJournalEntryDto,
    @Req() request: Request,
  ): Promise<JournalEntryDto> {
    return this.accounting.forward<JournalEntryDto>({
      method: 'POST',
      path: '/api/v1/journal-entries',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_READ)
  @ApiOperation({
    summary: 'List journal entries',
    description:
      'Lists journal entries in the JWT tenant. Permission: journal-entries.read.',
  })
  @ApiOkResponse({ type: JournalEntryListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<JournalEntryListDto> {
    return this.accounting.forward<JournalEntryListDto>({
      method: 'GET',
      path: '/api/v1/journal-entries',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_READ)
  @ApiOperation({
    summary: 'Get journal entry',
    description:
      'Returns a JWT-tenant journal entry. Permission: journal-entries.read.',
  })
  @ApiOkResponse({ type: JournalEntryDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JournalEntryDto> {
    return this.accounting.forward<JournalEntryDto>({
      method: 'GET',
      path: `/api/v1/journal-entries/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_UPDATE)
  @ApiOperation({
    summary: 'Update journal entry',
    description:
      'Updates a DRAFT JWT-tenant journal entry, optionally replacing all of its lines. Permission: journal-entries.update.',
  })
  @ApiOkResponse({ type: JournalEntryDto })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
    @Req() request: Request,
  ): Promise<JournalEntryDto> {
    return this.accounting.forward<JournalEntryDto>({
      method: 'PATCH',
      path: `/api/v1/journal-entries/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/post')
  @RequirePermissions(PERMISSIONS.JOURNAL_ENTRIES_POST)
  @ApiOperation({
    summary: 'Post journal entry',
    description:
      'Posts a balanced DRAFT journal entry, making it immutable. Permission: journal-entries.post.',
  })
  @ApiOkResponse({ type: JournalEntryDto })
  @ApiManagementErrors()
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<JournalEntryDto> {
    return this.accounting.forward<JournalEntryDto>({
      method: 'POST',
      path: `/api/v1/journal-entries/${id}/post`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
