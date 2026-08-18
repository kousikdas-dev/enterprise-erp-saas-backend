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
  CreateUnitDto,
  UnitDto,
  UnitListDto,
  UpdateUnitDto,
} from './dto/unit.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Units')
@Controller({ path: 'units', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UnitsController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.UNITS_CREATE)
  @ApiOperation({
    summary: 'Create unit of measure',
    description: 'Creates a unit in the JWT tenant. Permission: units.create.',
  })
  @ApiCreatedResponse({ type: UnitDto })
  @ApiConflictResponse({
    description: 'Unit code already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUnitDto,
    @Req() request: Request,
  ): Promise<UnitDto> {
    return this.inventory.forward<UnitDto>({
      method: 'POST',
      path: '/api/v1/units',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.UNITS_READ)
  @ApiOperation({
    summary: 'List units of measure',
    description: 'Lists units in the JWT tenant. Permission: units.read.',
  })
  @ApiOkResponse({ type: UnitListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<UnitListDto> {
    return this.inventory.forward<UnitListDto>({
      method: 'GET',
      path: '/api/v1/units',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.UNITS_READ)
  @ApiOperation({
    summary: 'Get unit of measure',
    description: 'Returns a JWT-tenant unit. Permission: units.read.',
  })
  @ApiOkResponse({ type: UnitDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UnitDto> {
    return this.inventory.forward<UnitDto>({
      method: 'GET',
      path: `/api/v1/units/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.UNITS_UPDATE)
  @ApiOperation({
    summary: 'Update unit of measure',
    description: 'Updates a JWT-tenant unit. Permission: units.update.',
  })
  @ApiOkResponse({ type: UnitDto })
  @ApiConflictResponse({
    description: 'Unit code already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @Req() request: Request,
  ): Promise<UnitDto> {
    return this.inventory.forward<UnitDto>({
      method: 'PATCH',
      path: `/api/v1/units/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
