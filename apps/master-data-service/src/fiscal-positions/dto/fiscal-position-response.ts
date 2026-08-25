function toFiscalPosition(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...row };
}

export { toFiscalPosition };