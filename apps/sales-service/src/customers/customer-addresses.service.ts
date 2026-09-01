import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { toCustomerAddress } from './dto/customer-address-response';
import {
  CreateCustomerAddressDto,
  UpdateCustomerAddressDto,
} from './dto/customer-address.dto';

@Injectable()
export class CustomerAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    customerId: string,
    dto: CreateCustomerAddressDto,
    request?: RequestAuditMeta,
  ) {
    await this.requireCustomer(actor, customerId);

    const isDefault = dto.isDefault ?? false;

    const address = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.customerAddress.updateMany({
          where: {
            tenantId: actor.tenantId,
            customerId,
            type: dto.type,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.create({
        data: {
          tenantId: actor.tenantId,
          customerId,
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
      action: 'customer.address.created',
      resource: 'customer_address',
      resourceId: address.id,
      metadata: {
        customerId,
        type: address.type,
        isDefault: address.isDefault,
      },
      request,
    });

    return toCustomerAddress(address);
  }

  async list(actor: ActorContext, customerId: string) {
    await this.requireCustomer(actor, customerId);

    const rows = await this.prisma.customerAddress.findMany({
      where: {
        tenantId: actor.tenantId,
        customerId,
      },
      orderBy: [
        { type: 'asc' },
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return {
      items: rows.map(toCustomerAddress),
    };
  }

  async update(
    actor: ActorContext,
    customerId: string,
    addressId: string,
    dto: UpdateCustomerAddressDto,
    request?: RequestAuditMeta,
  ) {
    const existing = await this.requireAddress(
      actor,
      customerId,
      addressId,
    );

    const data: {
      type?: 'BILLING' | 'SHIPPING';
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
        await tx.customerAddress.updateMany({
          where: {
            tenantId: actor.tenantId,
            customerId,
            type: newType,
            isDefault: true,
            id: { not: addressId },
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.customerAddress.update({
        where: {
          id: addressId,
        },
        data,
      });
    });

    await this.audit.record({
      actor,
      action: 'customer.address.updated',
      resource: 'customer_address',
      resourceId: address.id,
      metadata: data,
      request,
    });

    return toCustomerAddress(address);
  }

  async remove(
    actor: ActorContext,
    customerId: string,
    addressId: string,
    request?: RequestAuditMeta,
  ) {
    await this.requireAddress(actor, customerId, addressId);

    const address = await this.prisma.customerAddress.delete({
      where: {
        id: addressId,
      },
    });

    await this.audit.record({
      actor,
      action: 'customer.address.deleted',
      resource: 'customer_address',
      resourceId: address.id,
      metadata: {
        customerId,
        type: address.type,
      },
      request,
    });

    return {
      success: true,
      id: address.id,
    };
  }

  private async requireCustomer(
    actor: ActorContext,
    customerId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId: actor.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private async requireAddress(
    actor: ActorContext,
    customerId: string,
    addressId: string,
  ) {
    const address = await this.prisma.customerAddress.findFirst({
      where: {
        id: addressId,
        customerId,
        tenantId: actor.tenantId,
      },
    });

    if (!address) {
      throw new NotFoundException('Customer address not found');
    }

    return address;
  }
}
