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
import { toPaymentTerm } from './dto/payment-term-response';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
} from './dto/payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IdentityAuditClient,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePaymentTermDto,
    request?: RequestAuditMeta,
  ) {
    try {
      const row = await this.prisma.paymentTerm.create({
        data: {
          tenantId: actor.tenantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
        },
      });

      await this.audit.record({
        actor,
        action: 'payment_term.created',
        resource: 'payment_term',
        resourceId: row.id,
        metadata: {
          code: row.code,
          name: row.name,
        },
        request,
      });

      return toPaymentTerm(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Payment term code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async list(actor: ActorContext) {
    const rows = await this.prisma.paymentTerm.findMany({
      where: {
        tenantId: actor.tenantId,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return {
      items: rows.map(toPaymentTerm),
    };
  }

  async getById(actor: ActorContext, id: string) {
    return toPaymentTerm(await this.require(actor, id));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePaymentTermDto,
    request?: RequestAuditMeta,
  ) {
    await this.require(actor, id);

    const data: {
      code?: string;
      name?: string;
      isActive?: boolean;
    } = {};

    if (dto.code !== undefined) {
      data.code = dto.code.trim().toUpperCase();
    }

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const row = await this.prisma.paymentTerm.update({
        where: {
          id,
        },
        data,
      });

      await this.audit.record({
        actor,
        action: 'payment_term.updated',
        resource: 'payment_term',
        resourceId: row.id,
        metadata: data,
        request,
      });

      return toPaymentTerm(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Payment term code already exists in this tenant',
        );
      }

      throw error;
    }
  }

  async require(actor: ActorContext, id: string) {
    const row = await this.prisma.paymentTerm.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
      },
    });

    if (!row) {
      throw new NotFoundException('Payment term not found');
    }

    return row;
  }
}
