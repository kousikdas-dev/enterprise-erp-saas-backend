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
  CreatePricelistDto,
  PricelistDto,
  PricelistListDto,
  UpdatePricelistDto,
} from './dto/pricelist.dto';
import {
  CreatePricelistItemDto,
  PricelistItemDto,
  RemovePricelistItemResultDto,
  UpdatePricelistItemDto,
} from './dto/pricelist-item.dto';
import { SalesForwardService } from './sales-forward.service';

@ApiTags('Pricelists')
@Controller({ path: 'pricelists', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricelistsController {
  constructor(private readonly sales: SalesForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRICELISTS_CREATE)
  @ApiOperation({
    summary: 'Create pricelist',
    description:
      'Creates a pricelist (optionally with initial rule lines) in the JWT tenant. Permission: pricelists.create.',
  })
  @ApiCreatedResponse({ type: PricelistDto })
  @ApiConflictResponse({
    description: 'Pricelist name already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePricelistDto,
    @Req() request: Request,
  ): Promise<PricelistDto> {
    return this.sales.forward<PricelistDto>({
      method: 'POST',
      path: '/api/v1/pricelists',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRICELISTS_READ)
  @ApiOperation({
    summary: 'List pricelists',
    description:
      'Lists pricelists in the JWT tenant. Permission: pricelists.read.',
  })
  @ApiOkResponse({ type: PricelistListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PricelistListDto> {
    return this.sales.forward<PricelistListDto>({
      method: 'GET',
      path: '/api/v1/pricelists',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRICELISTS_READ)
  @ApiOperation({
    summary: 'Get pricelist',
    description:
      'Returns a JWT-tenant pricelist with its rule lines. Permission: pricelists.read.',
  })
  @ApiOkResponse({ type: PricelistDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PricelistDto> {
    return this.sales.forward<PricelistDto>({
      method: 'GET',
      path: `/api/v1/pricelists/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRICELISTS_UPDATE)
  @ApiOperation({
    summary: 'Update pricelist',
    description:
      'Updates a JWT-tenant pricelist. Permission: pricelists.update.',
  })
  @ApiOkResponse({ type: PricelistDto })
  @ApiConflictResponse({
    description: 'Pricelist name already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricelistDto,
    @Req() request: Request,
  ): Promise<PricelistDto> {
    return this.sales.forward<PricelistDto>({
      method: 'PATCH',
      path: `/api/v1/pricelists/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRICELISTS_UPDATE)
  @ApiOperation({
    summary: 'Add pricelist rule',
    description:
      'Adds a rule line to a JWT-tenant pricelist. Permission: pricelists.update.',
  })
  @ApiCreatedResponse({ type: PricelistItemDto })
  @ApiManagementErrors()
  addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePricelistItemDto,
    @Req() request: Request,
  ): Promise<PricelistItemDto> {
    return this.sales.forward<PricelistItemDto>({
      method: 'POST',
      path: `/api/v1/pricelists/${id}/items`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.PRICELISTS_UPDATE)
  @ApiOperation({
    summary: 'Update pricelist rule',
    description:
      'Updates a rule line on a JWT-tenant pricelist. Permission: pricelists.update.',
  })
  @ApiOkResponse({ type: PricelistItemDto })
  @ApiManagementErrors()
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdatePricelistItemDto,
    @Req() request: Request,
  ): Promise<PricelistItemDto> {
    return this.sales.forward<PricelistItemDto>({
      method: 'PATCH',
      path: `/api/v1/pricelists/${id}/items/${itemId}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions(PERMISSIONS.PRICELISTS_UPDATE)
  @ApiOperation({
    summary: 'Remove pricelist rule',
    description:
      'Removes a rule line from a JWT-tenant pricelist. Permission: pricelists.update.',
  })
  @ApiOkResponse({ type: RemovePricelistItemResultDto })
  @ApiManagementErrors()
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() request: Request,
  ): Promise<RemovePricelistItemResultDto> {
    return this.sales.forward<RemovePricelistItemResultDto>({
      method: 'DELETE',
      path: `/api/v1/pricelists/${id}/items/${itemId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
