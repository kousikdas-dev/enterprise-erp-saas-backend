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
  Query,
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
import { BomDto, BomListDto, CreateBomDto, UpdateBomDto } from './dto/bom.dto';
import { ProductionForwardService } from './production-forward.service';

@ApiTags('Production BOM')
@Controller({ path: 'production/boms', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BomsController {
  constructor(private readonly production: ProductionForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_CREATE)
  @ApiOperation({
    summary: 'Create a Bill of Materials',
    description:
      'Creates a DRAFT BOM at the next version for the given parent product. Quantities are decimal strings. Permission: production-boms.create.',
  })
  @ApiCreatedResponse({ type: BomDto })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBomDto,
    @Req() request: Request,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'POST',
      path: '/api/v1/boms',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_READ)
  @ApiOperation({
    summary: 'List BOMs',
    description:
      'Lists BOMs in the JWT tenant, optionally filtered to a single parent product (all its versions). Permission: production-boms.read.',
  })
  @ApiOkResponse({ type: BomListDto })
  @ApiManagementErrors()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('parentProductId') parentProductId?: string,
  ): Promise<BomListDto> {
    return this.production.forward<BomListDto>({
      method: 'GET',
      path: '/api/v1/boms',
      user,
      query: parentProductId ? { parentProductId } : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_READ)
  @ApiOperation({
    summary: 'Get a BOM',
    description: 'Returns a JWT-tenant BOM. Permission: production-boms.read.',
  })
  @ApiOkResponse({ type: BomDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'GET',
      path: `/api/v1/boms/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_UPDATE)
  @ApiOperation({
    summary: 'Update a BOM',
    description:
      'Updates a DRAFT BOM only. Permission: production-boms.update.',
  })
  @ApiOkResponse({ type: BomDto })
  @ApiConflictResponse({ description: 'BOM is not DRAFT' })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
    @Req() request: Request,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'PATCH',
      path: `/api/v1/boms/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_DELETE)
  @ApiOperation({
    summary: 'Delete a BOM',
    description:
      'Deletes a DRAFT BOM only. Permission: production-boms.delete.',
  })
  @ApiOkResponse()
  @ApiConflictResponse({ description: 'BOM is not DRAFT' })
  @ApiManagementErrors()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<{ id: string; removed: boolean }> {
    return this.production.forward<{ id: string; removed: boolean }>({
      method: 'DELETE',
      path: `/api/v1/boms/${id}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_ACTIVATE)
  @ApiOperation({
    summary: 'Activate a BOM',
    description:
      'Marks this BOM version ACTIVE and deactivates any other ACTIVE version of the same parent product. Permission: production-boms.activate.',
  })
  @ApiOkResponse({ type: BomDto })
  @ApiConflictResponse({ description: 'BOM cannot be activated' })
  @ApiManagementErrors()
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'POST',
      path: `/api/v1/boms/${id}/activate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_DEACTIVATE)
  @ApiOperation({
    summary: 'Deactivate a BOM',
    description:
      'Marks an ACTIVE BOM INACTIVE. Permission: production-boms.deactivate.',
  })
  @ApiOkResponse({ type: BomDto })
  @ApiConflictResponse({ description: 'BOM cannot be deactivated' })
  @ApiManagementErrors()
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'POST',
      path: `/api/v1/boms/${id}/deactivate`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/new-version')
  @RequirePermissions(PERMISSIONS.PRODUCTION_BOMS_CREATE)
  @ApiOperation({
    summary: 'Create a new BOM version',
    description:
      'Clones this BOM (header + items) into a new DRAFT at the next version for the same parent product. Permission: production-boms.create.',
  })
  @ApiCreatedResponse({ type: BomDto })
  @ApiManagementErrors()
  createNewVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<BomDto> {
    return this.production.forward<BomDto>({
      method: 'POST',
      path: `/api/v1/boms/${id}/new-version`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
