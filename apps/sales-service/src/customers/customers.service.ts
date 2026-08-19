import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityAuditClient } from '../audit/identity-audit.client';
import { ActorContext, RequestAuditMeta } from '../auth/actor-context';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueConstraintError } from '../prisma/prisma-errors';
import { toCustomer } from './dto/customer-response';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateCustomerDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.customer.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          billingAddress: dto.billingAddress?.trim() || null,
          shippingAddress: dto.shippingAddress?.trim() || null,
        },
      });
      await this.audit.record({
        actor,
        action: 'customer.created',
        resource: 'customer',
        resourceId: row.id,
        metadata: { code: row.code, name: row.name },
        request,
      });
      return toCustomer(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Customer code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map(toCustomer) };
  }

  async getById(actor: ActorContext, id: string) {
    return toCustomer(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateCustomerDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);
    const data: {
      code?: string;
      name?: string;
      email?: string | null;
      phone?: string | null;
      billingAddress?: string | null;
      shippingAddress?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.email !== undefined) {
      data.email = dto.email?.trim().toLowerCase() || null;
    }
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.billingAddress !== undefined) {
      data.billingAddress = dto.billingAddress?.trim() || null;
    }
    if (dto.shippingAddress !== undefined) {
      data.shippingAddress = dto.shippingAddress?.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }
    try {
      const row = await this.prisma.customer.update({ where: { id }, data });
      await this.audit.record({
        actor,
        action: 'customer.updated',
        resource: 'customer',
        resourceId: row.id,
        metadata: data,
        request,
      });
      return toCustomer(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Customer code already exists in this tenant',
        );
      }
      throw error;
    }
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.customer.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }
}
