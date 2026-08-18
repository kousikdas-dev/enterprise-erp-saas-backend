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
  CreateProductDto,
  ProductDto,
  ProductListDto,
  UpdateProductDto,
} from './dto/product.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Products')
@Controller({ path: 'products', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  @ApiOperation({
    summary: 'Create product',
    description:
      'Creates a product in the JWT tenant. Prices are decimal strings. Permission: products.create.',
  })
  @ApiCreatedResponse({ type: ProductDto })
  @ApiConflictResponse({ description: 'SKU already exists in this tenant' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
    @Req() request: Request,
  ): Promise<ProductDto> {
    return this.inventory.forward<ProductDto>({
      method: 'POST',
      path: '/api/v1/products',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: 'List products',
    description: 'Lists products in the JWT tenant. Permission: products.read.',
  })
  @ApiOkResponse({ type: ProductListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ProductListDto> {
    return this.inventory.forward<ProductListDto>({
      method: 'GET',
      path: '/api/v1/products',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: 'Get product',
    description: 'Returns a JWT-tenant product. Permission: products.read.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductDto> {
    return this.inventory.forward<ProductDto>({
      method: 'GET',
      path: `/api/v1/products/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Update product',
    description: 'Updates a JWT-tenant product. Permission: products.update.',
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiConflictResponse({ description: 'SKU already exists in this tenant' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Req() request: Request,
  ): Promise<ProductDto> {
    return this.inventory.forward<ProductDto>({
      method: 'PATCH',
      path: `/api/v1/products/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
