import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@app/common';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiManagementErrors } from '../identity/api-management-errors';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import {
  ProformaInvoiceDto,
  ProformaInvoiceListDto,
} from './dto/proforma-invoice.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Proforma Invoices')
@Controller({ path: 'proforma-invoices', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProformaInvoicesController {
  constructor(private readonly sales: SalesForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_READ)
  @ApiOperation({
    summary: 'List proforma invoices',
    description:
      'Lists proforma invoices in the JWT tenant. Permission: proforma-invoices.read.',
  })
  @ApiOkResponse({ type: ProformaInvoiceListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProformaInvoiceListDto> {
    return this.sales.forward<ProformaInvoiceListDto>({
      method: 'GET',
      path: '/api/v1/proforma-invoices',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PROFORMA_INVOICES_READ)
  @ApiOperation({
    summary: 'Get proforma invoice',
    description:
      'Returns a JWT-tenant proforma invoice. Permission: proforma-invoices.read.',
  })
  @ApiOkResponse({ type: ProformaInvoiceDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProformaInvoiceDto> {
    return this.sales.forward<ProformaInvoiceDto>({
      method: 'GET',
      path: `/api/v1/proforma-invoices/${id}`,
      user,
    });
  }
}
