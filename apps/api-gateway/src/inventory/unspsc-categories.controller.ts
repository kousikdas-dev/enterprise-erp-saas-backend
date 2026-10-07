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
  CreateUnspscCategoryDto,
  UnspscCategoryDto,
  UnspscCategoryListDto,
  UpdateUnspscCategoryDto,
} from './dto/unspsc-category.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('UNSPSC Categories')
@Controller({ path: 'unspsc-categories', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnspscCategoriesController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.UNSPSC_CATEGORIES_CREATE)
  @ApiOperation({
    summary: 'Create UNSPSC category',
    description:
      'Creates a UNSPSC category in the JWT tenant. Permission: unspsc-categories.create.',
  })
  @ApiCreatedResponse({ type: UnspscCategoryDto })
  @ApiConflictResponse({
    description: 'UNSPSC category code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUnspscCategoryDto,
    @Req() request: Request,
  ): Promise<UnspscCategoryDto> {
    return this.inventory.forward<UnspscCategoryDto>({
      method: 'POST',
      path: '/api/v1/unspsc-categories',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.UNSPSC_CATEGORIES_READ)
  @ApiOperation({
    summary: 'List UNSPSC categories',
    description:
      'Lists UNSPSC categories in the JWT tenant. Permission: unspsc-categories.read.',
  })
  @ApiOkResponse({ type: UnspscCategoryListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnspscCategoryListDto> {
    return this.inventory.forward<UnspscCategoryListDto>({
      method: 'GET',
      path: '/api/v1/unspsc-categories',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.UNSPSC_CATEGORIES_READ)
  @ApiOperation({
    summary: 'Get UNSPSC category',
    description:
      'Returns a JWT-tenant UNSPSC category. Permission: unspsc-categories.read.',
  })
  @ApiOkResponse({ type: UnspscCategoryDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UnspscCategoryDto> {
    return this.inventory.forward<UnspscCategoryDto>({
      method: 'GET',
      path: `/api/v1/unspsc-categories/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.UNSPSC_CATEGORIES_UPDATE)
  @ApiOperation({
    summary: 'Update UNSPSC category',
    description:
      'Updates a JWT-tenant UNSPSC category. Permission: unspsc-categories.update.',
  })
  @ApiOkResponse({ type: UnspscCategoryDto })
  @ApiConflictResponse({
    description: 'UNSPSC category code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnspscCategoryDto,
    @Req() request: Request,
  ): Promise<UnspscCategoryDto> {
    return this.inventory.forward<UnspscCategoryDto>({
      method: 'PATCH',
      path: `/api/v1/unspsc-categories/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
