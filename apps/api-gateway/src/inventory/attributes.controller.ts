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
  AttributeDto,
  AttributeListDto,
  CreateAttributeDto,
  UpdateAttributeDto,
} from './dto/attribute.dto';
import {
  AttributeValueDto,
  CreateAttributeValueDto,
  RemoveAttributeValueResultDto,
  UpdateAttributeValueDto,
} from './dto/attribute-value.dto';
import { InventoryForwardService } from './inventory-forward.service';

@ApiTags('Attributes')
@Controller({ path: 'attributes', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttributesController {
  constructor(private readonly inventory: InventoryForwardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_CREATE)
  @ApiOperation({
    summary: 'Create attribute',
    description:
      'Creates an attribute (optionally with initial values) in the JWT tenant. Permission: attributes.create.',
  })
  @ApiCreatedResponse({ type: AttributeDto })
  @ApiConflictResponse({
    description: 'Attribute name already exists in this tenant',
  })
  @ApiManagementErrors()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAttributeDto,
    @Req() request: Request,
  ): Promise<AttributeDto> {
    return this.inventory.forward<AttributeDto>({
      method: 'POST',
      path: '/api/v1/attributes',
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_READ)
  @ApiOperation({
    summary: 'List attributes',
    description:
      'Lists attributes in the JWT tenant. Permission: attributes.read.',
  })
  @ApiOkResponse({ type: AttributeListDto })
  @ApiManagementErrors()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AttributeListDto> {
    return this.inventory.forward<AttributeListDto>({
      method: 'GET',
      path: '/api/v1/attributes',
      user,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_READ)
  @ApiOperation({
    summary: 'Get attribute',
    description:
      'Returns a JWT-tenant attribute with its values. Permission: attributes.read.',
  })
  @ApiOkResponse({ type: AttributeDto })
  @ApiManagementErrors()
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttributeDto> {
    return this.inventory.forward<AttributeDto>({
      method: 'GET',
      path: `/api/v1/attributes/${id}`,
      user,
    });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_UPDATE)
  @ApiOperation({
    summary: 'Update attribute',
    description:
      'Updates a JWT-tenant attribute. Permission: attributes.update.',
  })
  @ApiOkResponse({ type: AttributeDto })
  @ApiConflictResponse({
    description: 'Attribute name already exists in this tenant',
  })
  @ApiManagementErrors()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
    @Req() request: Request,
  ): Promise<AttributeDto> {
    return this.inventory.forward<AttributeDto>({
      method: 'PATCH',
      path: `/api/v1/attributes/${id}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Post(':id/values')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_UPDATE)
  @ApiOperation({
    summary: 'Add attribute value',
    description:
      'Adds a value to a JWT-tenant attribute. Permission: attributes.update.',
  })
  @ApiCreatedResponse({ type: AttributeValueDto })
  @ApiConflictResponse({
    description: 'This value already exists for the attribute',
  })
  @ApiManagementErrors()
  addValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttributeValueDto,
    @Req() request: Request,
  ): Promise<AttributeValueDto> {
    return this.inventory.forward<AttributeValueDto>({
      method: 'POST',
      path: `/api/v1/attributes/${id}/values`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Patch(':id/values/:valueId')
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_UPDATE)
  @ApiOperation({
    summary: 'Update attribute value',
    description:
      'Updates a value on a JWT-tenant attribute. Permission: attributes.update.',
  })
  @ApiOkResponse({ type: AttributeValueDto })
  @ApiConflictResponse({
    description: 'This value already exists for the attribute',
  })
  @ApiManagementErrors()
  updateValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Body() dto: UpdateAttributeValueDto,
    @Req() request: Request,
  ): Promise<AttributeValueDto> {
    return this.inventory.forward<AttributeValueDto>({
      method: 'PATCH',
      path: `/api/v1/attributes/${id}/values/${valueId}`,
      user,
      body: { ...dto },
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }

  @Delete(':id/values/:valueId')
  @RequirePermissions(PERMISSIONS.ATTRIBUTES_UPDATE)
  @ApiOperation({
    summary: 'Remove attribute value',
    description:
      'Removes a value from a JWT-tenant attribute. Permission: attributes.update.',
  })
  @ApiOkResponse({ type: RemoveAttributeValueResultDto })
  @ApiManagementErrors()
  removeValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Req() request: Request,
  ): Promise<RemoveAttributeValueResultDto> {
    return this.inventory.forward<RemoveAttributeValueResultDto>({
      method: 'DELETE',
      path: `/api/v1/attributes/${id}/values/${valueId}`,
      user,
      ip: request.ip,
      userAgent: headerString(request.headers['user-agent']),
    });
  }
}
