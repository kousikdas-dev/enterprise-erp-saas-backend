-- CreateTable
CREATE TABLE "delivery_methods" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "price" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_methods_tenantId_idx" ON "delivery_methods"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_methods_tenantId_code_key" ON "delivery_methods"("tenantId", "code");
