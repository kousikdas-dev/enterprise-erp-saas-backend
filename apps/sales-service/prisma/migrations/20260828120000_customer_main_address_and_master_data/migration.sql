-- Add Customer basic-information, master-data reference, and main-address fields.
-- Master-data UUIDs intentionally have no foreign keys: that data belongs to a
-- separate service/database.
ALTER TABLE "customers"
    ADD COLUMN "company" TEXT,
    ADD COLUMN "jobPosition" TEXT,
    ADD COLUMN "website" TEXT,
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "gstin" TEXT,
    ADD COLUMN "salespersonId" UUID,
    ADD COLUMN "paymentTermId" UUID,
    ADD COLUMN "paymentMethodId" UUID,
    ADD COLUMN "fiscalPositionId" UUID,
    ADD COLUMN "industryId" UUID,
    ADD COLUMN "street" TEXT,
    ADD COLUMN "street2" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "zip" TEXT,
    ADD COLUMN "state" TEXT,
    ADD COLUMN "country" TEXT;

-- Preserve legacy free-form values as missing structured CustomerAddress rows.
-- CustomerAddress.city and CustomerAddress.country are required by the existing
-- schema. Empty strings explicitly represent unknown values; no location is
-- inferred from the legacy address text.
--
-- The deterministic UUIDs make the insert safe if this SQL is ever rerun after
-- a partial/manual execution. Prisma migrations run transactionally on PostgreSQL.
INSERT INTO "customer_addresses" (
    "id",
    "tenantId",
    "customerId",
    "type",
    "name",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
    "phone",
    "isDefault",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    (
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:BILLING') FROM 1 FOR 8) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:BILLING') FROM 9 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:BILLING') FROM 13 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:BILLING') FROM 17 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:BILLING') FROM 21 FOR 12)
    )::UUID,
    c."tenantId",
    c."id",
    'BILLING'::"CustomerAddressType",
    c."name" || ' Billing (Legacy)',
    c."billingAddress",
    NULL,
    '',
    NULL,
    NULL,
    '',
    NULL,
    NOT EXISTS (
        SELECT 1
        FROM "customer_addresses" existing_default
        WHERE existing_default."tenantId" = c."tenantId"
          AND existing_default."customerId" = c."id"
          AND existing_default."type" = 'BILLING'::"CustomerAddressType"
          AND existing_default."isDefault" = true
    ),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "customers" c
WHERE NULLIF(BTRIM(c."billingAddress"), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "customer_addresses" existing_address
      WHERE existing_address."tenantId" = c."tenantId"
        AND existing_address."customerId" = c."id"
        AND existing_address."type" = 'BILLING'::"CustomerAddressType"
  );

INSERT INTO "customer_addresses" (
    "id",
    "tenantId",
    "customerId",
    "type",
    "name",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
    "phone",
    "isDefault",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    (
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:SHIPPING') FROM 1 FOR 8) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:SHIPPING') FROM 9 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:SHIPPING') FROM 13 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:SHIPPING') FROM 17 FOR 4) || '-' ||
        SUBSTRING(MD5(c."id"::TEXT || ':legacy:SHIPPING') FROM 21 FOR 12)
    )::UUID,
    c."tenantId",
    c."id",
    'SHIPPING'::"CustomerAddressType",
    c."name" || ' Shipping (Legacy)',
    c."shippingAddress",
    NULL,
    '',
    NULL,
    NULL,
    '',
    NULL,
    NOT EXISTS (
        SELECT 1
        FROM "customer_addresses" existing_default
        WHERE existing_default."tenantId" = c."tenantId"
          AND existing_default."customerId" = c."id"
          AND existing_default."type" = 'SHIPPING'::"CustomerAddressType"
          AND existing_default."isDefault" = true
    ),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "customers" c
WHERE NULLIF(BTRIM(c."shippingAddress"), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "customer_addresses" existing_address
      WHERE existing_address."tenantId" = c."tenantId"
        AND existing_address."customerId" = c."id"
        AND existing_address."type" = 'SHIPPING'::"CustomerAddressType"
  );

ALTER TABLE "customers"
    DROP COLUMN "billingAddress",
    DROP COLUMN "shippingAddress";

CREATE INDEX "customers_tenantId_salespersonId_idx" ON "customers"("tenantId", "salespersonId");
CREATE INDEX "customers_tenantId_paymentTermId_idx" ON "customers"("tenantId", "paymentTermId");
CREATE INDEX "customers_tenantId_paymentMethodId_idx" ON "customers"("tenantId", "paymentMethodId");
CREATE INDEX "customers_tenantId_fiscalPositionId_idx" ON "customers"("tenantId", "fiscalPositionId");
CREATE INDEX "customers_tenantId_industryId_idx" ON "customers"("tenantId", "industryId");
