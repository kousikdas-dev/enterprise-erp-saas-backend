import { Body, Controller, Post } from '@nestjs/common';
import { LookupPermissionsDto } from './dto/lookup-permissions.dto';
import { RbacService } from './rbac.service';

@Controller({ path: 'internal/rbac', version: '1' })
export class InternalRbacController {
  constructor(private readonly rbac: RbacService) {}

  @Post('permissions')
  async lookup(
    @Body() dto: LookupPermissionsDto,
  ): Promise<{ permissions: string[] }> {
    const permissions = await this.rbac.listPermissionKeys(
      dto.userId,
      dto.tenantId,
    );
    return { permissions };
  }
}
