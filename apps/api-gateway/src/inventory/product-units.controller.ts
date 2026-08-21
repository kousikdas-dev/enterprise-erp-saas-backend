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
  CreateProductUnitDto,
  ProductUnitDto,
  ProductUnitListDto,
  RemoveProductUnitResultDto,
  UpdateProductUnitDto,
} from './dto/product-unit.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Product Units')
@Controller({ path: 'products/:productId/units', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductUnitsController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: 'List product units',
    description:
      'Lists the unit-of-measure variants for a JWT-tenant product. Permission: products.read.',
  })
  @ApiOkResponse({ type: ProductUnitListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductUnitListDto> {
    return this.inventory.forward<ProductUnitListDto>({
      method: 'GET',
      path: `/api/v1/products/${productId}/units`,
      user,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Add product unit',
    description:
      'Adds a unit-of-measure variant to a JWT-tenant product. Permission: products.update.',
  })
  @ApiCreatedResponse({ type: ProductUnitDto })
  @ApiConflictResponse({ description: 'Unit already added to this product' })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductUnitDto,
    @Req() request: Request,
  ): Promise<ProductUnitDto> {
    return this.inventory.forward<ProductUnitDto>({
      method: 'POST',
      path: `/api/v1/products/${productId}/units`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':unitId')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Update product unit',
    description:
      'Updates a unit-of-measure variant on a JWT-tenant product. Permission: products.update.',
  })
  @ApiOkResponse({ type: ProductUnitDto })
  @ApiConflictResponse({ description: 'Unit already added to this product' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdateProductUnitDto,
    @Req() request: Request,
  ): Promise<ProductUnitDto> {
    return this.inventory.forward<ProductUnitDto>({
      method: 'PATCH',
      path: `/api/v1/products/${productId}/units/${unitId}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':unitId')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @ApiOperation({
    summary: 'Remove product unit',
    description:
      'Removes a unit-of-measure variant from a JWT-tenant product. Permission: products.update.',
  })
  @ApiOkResponse({ type: RemoveProductUnitResultDto })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Req() request: Request,
  ): Promise<RemoveProductUnitResultDto> {
    return this.inventory.forward<RemoveProductUnitResultDto>({
      method: 'DELETE',
      path: `/api/v1/products/${productId}/units/${unitId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
