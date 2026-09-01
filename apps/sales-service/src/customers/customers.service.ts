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

          // Basic Information
          company: dto.company?.trim() || null,
          email: dto.email?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          jobPosition: dto.jobPosition?.trim() || null,
          website: dto.website?.trim() || null,
          tags: dto.tags ?? [],
          gstin: dto.gstin?.trim().toUpperCase() || null,

          // Sales
          salespersonId: dto.salespersonId || null,
          paymentTermId: dto.paymentTermId || null,
          paymentMethodId: dto.paymentMethodId || null,
          fiscalPositionId: dto.fiscalPositionId || null,
          industryId: dto.industryId || null,

          // Main Address
          street: dto.street?.trim() || null,
          street2: dto.street2?.trim() || null,
          city: dto.city?.trim() || null,
          zip: dto.zip?.trim() || null,
          state: dto.state?.trim() || null,
          country: dto.country?.trim() || null,
        },
      });

      await this.audit.record({
        actor,
        action: 'customer.created',
        resource: 'customer',
        resourceId: row.id,
        metadata: {
          code: row.code,
          name: row.name,
        },
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
      include: {
        addresses: {
          orderBy: [
            { type: 'asc' },
            { isDefault: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    return {
      items: rows.map(toCustomer),
    };
  }

  async getById(actor: ActorContext, id: string) {
    const row = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
      },
      include: {
        addresses: {
          orderBy: [
            { type: 'asc' },
            { isDefault: 'desc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Customer not found');
    }

    return toCustomer(row);
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

      // Basic Information
      company?: string | null;
      email?: string | null;
      phone?: string | null;
      jobPosition?: string | null;
      website?: string | null;
      tags?: string[];
      gstin?: string | null;

      // Sales
      salespersonId?: string | null;
      paymentTermId?: string | null;
      paymentMethodId?: string | null;
      fiscalPositionId?: string | null;
      industryId?: string | null;

      // Main Address
      street?: string | null;
      street2?: string | null;
      city?: string | null;
      zip?: string | null;
      state?: string | null;
      country?: string | null;

      isActive?: boolean;
    } = {};

    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    // Basic Information
    if (dto.company !== undefined) {
      data.company = dto.company?.trim() || null;
    }

    if (dto.email !== undefined) {
      data.email = dto.email?.trim().toLowerCase() || null;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone?.trim() || null;
    }

    if (dto.jobPosition !== undefined) {
      data.jobPosition = dto.jobPosition?.trim() || null;
    }

    if (dto.website !== undefined) {
      data.website = dto.website?.trim() || null;
    }

    if (dto.tags !== undefined) {
      data.tags = dto.tags;
    }

    if (dto.gstin !== undefined) {
      data.gstin = dto.gstin?.trim().toUpperCase() || null;
    }

    // Sales
    if (dto.salespersonId !== undefined) {
      data.salespersonId = dto.salespersonId || null;
    }

    if (dto.paymentTermId !== undefined) {
      data.paymentTermId = dto.paymentTermId || null;
    }

    if (dto.paymentMethodId !== undefined) {
      data.paymentMethodId = dto.paymentMethodId || null;
    }

    if (dto.fiscalPositionId !== undefined) {
      data.fiscalPositionId = dto.fiscalPositionId || null;
    }

    if (dto.industryId !== undefined) {
      data.industryId = dto.industryId || null;
    }

    // Main Address
    if (dto.street !== undefined) {
      data.street = dto.street?.trim() || null;
    }

    if (dto.street2 !== undefined) {
      data.street2 = dto.street2?.trim() || null;
    }

    if (dto.city !== undefined) {
      data.city = dto.city?.trim() || null;
    }

    if (dto.zip !== undefined) {
      data.zip = dto.zip?.trim() || null;
    }

    if (dto.state !== undefined) {
      data.state = dto.state?.trim() || null;
    }

    if (dto.country !== undefined) {
      data.country = dto.country?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const row = await this.prisma.customer.update({
        where: { id },
        data,
      });

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
      where: {
        id,
        tenantId: actor.tenantId,
      },
    });

    if (!row) {
      throw new NotFoundException('Customer not found');
    }

    return row;
  }
}
