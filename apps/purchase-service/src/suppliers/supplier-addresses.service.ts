import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { toSupplierAddress } from './dto/supplier-address-response';
import {
  CreateSupplierAddressDto,
  UpdateSupplierAddressDto,
} from './dto/supplier-address.dto';

@Injectable()
export class SupplierAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    supplierId: string,
    dto: CreateSupplierAddressDto,
    request?: RequestAuditMeta,
  ) {
    await this.requireSupplier(actor, supplierId);

    const isDefault = dto.isDefault ?? false;

    const address = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.supplierAddress.updateMany({
          where: {
            tenantId: actor.tenantId,
            supplierId,
            type: dto.type,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.supplierAddress.create({
        data: {
          tenantId: actor.tenantId,
          supplierId,
          type: dto.type,
          name: dto.name.trim(),
          addressLine1: dto.addressLine1.trim(),
          addressLine2: dto.addressLine2?.trim() || null,
          city: dto.city.trim(),
          state: dto.state?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          country: dto.country.trim(),
          phone: dto.phone?.trim() || null,
          isDefault,
        },
      });
    });

    await this.audit.record({
      actor,
      action: 'supplier.address.created',
      resource: 'supplier_address',
      resourceId: address.id,
      metadata: {
        supplierId,
        type: address.type,
        isDefault: address.isDefault,
      },
      request,
    });

    return toSupplierAddress(address);
  }

  async list(actor: ActorContext, supplierId: string) {
    await this.requireSupplier(actor, supplierId);

    const rows = await this.prisma.supplierAddress.findMany({
      where: {
        tenantId: actor.tenantId,
        supplierId,
      },
      orderBy: [
        { type: 'asc' },
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return {
      items: rows.map(toSupplierAddress),
    };
  }

  async update(
    actor: ActorContext,
    supplierId: string,
    addressId: string,
    dto: UpdateSupplierAddressDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireAddress(actor, supplierId, addressId);

    const data: {
      type?: 'BILLING' | 'DISPATCH';
      name?: string;
      addressLine1?: string;
      addressLine2?: string | null;
      city?: string;
      state?: string | null;
      postalCode?: string | null;
      country?: string;
      phone?: string | null;
      isDefault?: boolean;
      isActive?: boolean;
    } = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.addressLine1 !== undefined) {
      data.addressLine1 = dto.addressLine1.trim();
    }
    if (dto.addressLine2 !== undefined) {
      data.addressLine2 = dto.addressLine2?.trim() || null;
    }
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.state !== undefined) {
      data.state = dto.state?.trim() || null;
    }
    if (dto.postalCode !== undefined) {
      data.postalCode = dto.postalCode?.trim() || null;
    }
    if (dto.country !== undefined) data.country = dto.country.trim();
    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const newType = dto.type ?? existing.type;
    const willBeDefault = data.isDefault ?? existing.isDefault;

    if (dto.isDefault === true) {
      data.isDefault = true;
    } else if (dto.isDefault === false) {
      data.isDefault = false;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const address = await this.prisma.$transaction(async (tx) => {
      if (
        willBeDefault &&
        (data.isDefault === true || newType !== existing.type)
      ) {
        await tx.supplierAddress.updateMany({
          where: {
            tenantId: actor.tenantId,
            supplierId,
            type: newType,
            isDefault: true,
            id: { not: addressId },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.supplierAddress.update({
        where: {
          id: addressId,
        },
        data,
      });
    });

    await this.audit.record({
      actor,
      action: 'supplier.address.updated',
      resource: 'supplier_address',
      resourceId: address.id,
      metadata: data,
      request,
    });

    return toSupplierAddress(address);
  }

  async remove(
    actor: ActorContext,
    supplierId: string,
    addressId: string,
    request?: RequestAuditMeta,
  ) {
    await this.requireAddress(actor, supplierId, addressId);

    const address = await this.prisma.supplierAddress.delete({
      where: {
        id: addressId,
      },
    });

    await this.audit.record({
      actor,
      action: 'supplier.address.deleted',
      resource: 'supplier_address',
      resourceId: address.id,
      metadata: {
        supplierId,
        type: address.type,
      },
      request,
    });

    return {
      success: true,
      id: address.id,
    };
  }

  private async requireSupplier(actor: ActorContext, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        tenantId: actor.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  private async requireAddress(
    actor: ActorContext,
    supplierId: string,
    addressId: string,
  ) {
    const address = await this.prisma.supplierAddress.findFirst({
      where: {
        id: addressId,
        supplierId,
        tenantId: actor.tenantId,
      },
    });

    if (!address) {
      throw new NotFoundException('Supplier address not found');
    }

    return address;
  }
}
