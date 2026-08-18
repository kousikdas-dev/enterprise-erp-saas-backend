import { Injectable } from '@nestjs/common';
import { permissionKey } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissionKeys(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });
    if (!user || user.tenantId !== tenantId) {
      return [];
    }

    const assignments = await this.prisma.userRole.findMany({
      where: { userId: user.id, tenantId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const keys = new Set<string>();
    for (const assignment of assignments) {
      for (const link of assignment.role.rolePermissions) {
        keys.add(
          permissionKey(link.permission.resource, link.permission.action),
        );
      }
    }
    return [...keys];
  }
}
