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
  CategoryDto,
  CategoryListDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Categories')
@Controller({ path: 'categories', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CATEGORIES_CREATE)
  @ApiOperation({
    summary: 'Create category',
    description:
      'Creates a category in the JWT tenant. Permission: categories.create.',
  })
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({
    description: 'Category name already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
    @Req() request: Request,
  ): Promise<CategoryDto> {
    return this.inventory.forward<CategoryDto>({
      method: 'POST',
      path: '/api/v1/categories',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CATEGORIES_READ)
  @ApiOperation({
    summary: 'List categories',
    description:
      'Lists categories in the JWT tenant. Permission: categories.read.',
  })
  @ApiOkResponse({ type: CategoryListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CategoryListDto> {
    return this.inventory.forward<CategoryListDto>({
      method: 'GET',
      path: '/api/v1/categories',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_READ)
  @ApiOperation({
    summary: 'Get category',
    description: 'Returns a JWT-tenant category. Permission: categories.read.',
  })
  @ApiOkResponse({ type: CategoryDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    return this.inventory.forward<CategoryDto>({
      method: 'GET',
      path: `/api/v1/categories/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_UPDATE)
  @ApiOperation({
    summary: 'Update category',
    description:
      'Updates a JWT-tenant category. Permission: categories.update.',
  })
  @ApiOkResponse({ type: CategoryDto })
  @ApiConflictResponse({
    description: 'Category name already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: Request,
  ): Promise<CategoryDto> {
    return this.inventory.forward<CategoryDto>({
      method: 'PATCH',
      path: `/api/v1/categories/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
