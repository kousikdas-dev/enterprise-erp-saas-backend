function toCustomer(row: {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...row };
}

export { toCustomer };
