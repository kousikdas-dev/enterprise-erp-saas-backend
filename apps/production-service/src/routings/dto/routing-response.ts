import { Prisma, RoutingStatus } from '../../../generated/prisma-client';
import { quantityToString } from '../../common/decimal';

type RoutingStepRow = {
  id: string;
  tenantId: string;
  routingId: string;
  sequence: number;
  operationId: string;
  operationCode: string;
  operationName: string;
  workCentreId: string;
  workCentreCode: string;
  workCentreName: string;
  setupMinutes: number;
  runMinutesPerUnit: Prisma.Decimal;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoutingWithSteps = {
  id: string;
  tenantId: string;
  productId: string;
  productSku: string;
  productName: string;
  name: string;
  version: number;
  status: RoutingStatus;
  description: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
  steps: RoutingStepRow[];
};

function toRoutingStepResponse(step: RoutingStepRow) {
  return {
    id: step.id,
    tenantId: step.tenantId,
    routingId: step.routingId,
    sequence: step.sequence,
    operationId: step.operationId,
    operationCode: step.operationCode,
    operationName: step.operationName,
    workCentreId: step.workCentreId,
    workCentreCode: step.workCentreCode,
    workCentreName: step.workCentreName,
    setupMinutes: step.setupMinutes,
    runMinutesPerUnit: quantityToString(step.runMinutesPerUnit),
    description: step.description,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

export function toRoutingResponse(row: RoutingWithSteps) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productId: row.productId,
    productSku: row.productSku,
    productName: row.productName,
    name: row.name,
    version: row.version,
    status: row.status,
    description: row.description,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    steps: row.steps
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(toRoutingStepResponse),
  };
}
