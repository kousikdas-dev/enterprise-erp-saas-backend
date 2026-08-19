-- CreateSchema
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "ProformaSourceType" AS ENUM ('QUOTATION', 'SALES_ORDER');

CREATE TYPE "ProformaInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING_STOCK', 'POSTED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT NOT NULL,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proforma_invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceType" "ProformaSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "status" "ProformaInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proforma_invoice_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "quotationId" UUID,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT NOT NULL,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "total" DECIMAL(19,4) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_order_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "unitPrice" DECIMAL(19,4) NOT NULL,
    "lineTotal" DECIMAL(19,4) NOT NULL,
    "shippedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING_STOCK',
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "salesOrderItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "customers_tenantId_code_key" ON "customers"("tenantId", "code");
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

CREATE INDEX "quotations_tenantId_idx" ON "quotations"("tenantId");
CREATE INDEX "quotations_customerId_idx" ON "quotations"("customerId");
CREATE INDEX "quotations_tenantId_status_idx" ON "quotations"("tenantId", "status");

CREATE INDEX "quotation_items_tenantId_idx" ON "quotation_items"("tenantId");
CREATE INDEX "quotation_items_quotationId_idx" ON "quotation_items"("quotationId");
CREATE INDEX "quotation_items_productId_idx" ON "quotation_items"("productId");

CREATE INDEX "proforma_invoices_tenantId_idx" ON "proforma_invoices"("tenantId");
CREATE INDEX "proforma_invoices_tenantId_sourceType_sourceId_idx" ON "proforma_invoices"("tenantId", "sourceType", "sourceId");
CREATE INDEX "proforma_invoices_tenantId_status_idx" ON "proforma_invoices"("tenantId", "status");

CREATE INDEX "proforma_invoice_items_tenantId_idx" ON "proforma_invoice_items"("tenantId");
CREATE INDEX "proforma_invoice_items_proformaInvoiceId_idx" ON "proforma_invoice_items"("proformaInvoiceId");
CREATE INDEX "proforma_invoice_items_productId_idx" ON "proforma_invoice_items"("productId");

CREATE UNIQUE INDEX "sales_orders_quotationId_key" ON "sales_orders"("quotationId");
CREATE INDEX "sales_orders_tenantId_idx" ON "sales_orders"("tenantId");
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");
CREATE INDEX "sales_orders_tenantId_status_idx" ON "sales_orders"("tenantId", "status");

CREATE INDEX "sales_order_items_tenantId_idx" ON "sales_order_items"("tenantId");
CREATE INDEX "sales_order_items_salesOrderId_idx" ON "sales_order_items"("salesOrderId");
CREATE INDEX "sales_order_items_productId_idx" ON "sales_order_items"("productId");

CREATE INDEX "shipments_tenantId_idx" ON "shipments"("tenantId");
CREATE INDEX "shipments_salesOrderId_idx" ON "shipments"("salesOrderId");
CREATE INDEX "shipments_tenantId_status_idx" ON "shipments"("tenantId", "status");

CREATE INDEX "shipment_items_tenantId_idx" ON "shipment_items"("tenantId");
CREATE INDEX "shipment_items_shipmentId_idx" ON "shipment_items"("shipmentId");
CREATE INDEX "shipment_items_salesOrderItemId_idx" ON "shipment_items"("salesOrderItemId");
CREATE INDEX "shipment_items_productId_idx" ON "shipment_items"("productId");

-- ForeignKeys
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
