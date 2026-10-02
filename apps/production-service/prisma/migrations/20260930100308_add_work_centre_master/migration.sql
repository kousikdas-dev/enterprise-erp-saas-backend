-- CreateTable
CREATE TABLE "work_centres" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_centres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_centres_tenantId_idx" ON "work_centres"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "work_centres_tenantId_code_key" ON "work_centres"("tenantId", "code");
