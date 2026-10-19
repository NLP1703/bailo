-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'INITIATED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY', 'MOCK');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "InspectionCondition" AS ENUM ('GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('WATER', 'ELECTRICITY');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MAINTENANCE', 'UTILITIES', 'TAX', 'SALARY', 'INSURANCE', 'SUPPLIES', 'MARKETING', 'OTHER');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('XAF', 'EUR', 'USD', 'CAD', 'GBP');

-- CreateEnum
CREATE TYPE "AnomalyKind" AS ENUM ('LATE_PAYER', 'VACANCY_LONG', 'PRICE_OUTLIER', 'CONSUMPTION_SPIKE', 'MISSING_RECEIPT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DELETE';
ALTER TYPE "AuditAction" ADD VALUE 'ARCHIVE';
ALTER TYPE "AuditAction" ADD VALUE 'RESTORE';

-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'CONTRACT_SIGN';

-- NOTE: on NE SUPPRIME PAS l'index "unit_reservedUntil_idx" ni la colonne "unitShared" :
-- ils sont maintenus hors-Prisma (voir 0001_constraints et 0008_unit_reservation).
-- Prisma les voit comme "drift" mais ils sont intentionnels.

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "diasporaMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayCurrency" "Currency" NOT NULL DEFAULT 'XAF',
ADD COLUMN     "momoApiKeyRef" TEXT,
ADD COLUMN     "momoMerchantId" TEXT,
ADD COLUMN     "momoProvider" "PaymentProvider",
ADD COLUMN     "verifyBaseUrl" TEXT,
ALTER COLUMN "receiptPrefix" SET DEFAULT 'BL';

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "paymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "site" ADD COLUMN     "defaultFurnished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketReferenceRent" INTEGER;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "reliabilityScore" INTEGER;

-- CreateTable
CREATE TABLE "payment_intent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerRef" TEXT,
    "phone" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'XAF',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "statusMessage" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "allocationPlan" JSONB,
    "webhookPayload" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "monthlyRent" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "durationMonths" INTEGER,
    "noticeDays" INTEGER NOT NULL DEFAULT 30,
    "bodyHtml" TEXT NOT NULL,
    "pdfKey" TEXT,
    "signedByTenant" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "signatureOtpId" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "kind" "InspectionKind" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT NOT NULL,
    "summary" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "withholding" INTEGER NOT NULL DEFAULT 0,
    "withholdingNote" TEXT,
    "signedByTenantAt" TIMESTAMP(3),
    "tenantSignatureName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_item" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "condition" "InspectionCondition" NOT NULL,
    "note" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "unitId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedTo" TEXT,
    "assignedPhone" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvedAt" TIMESTAMP(3),
    "cost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "maintenance_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "MeterType" NOT NULL,
    "identifier" TEXT,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "unitLabel" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_reading" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL,
    "value" INTEGER NOT NULL,
    "consumption" INTEGER NOT NULL,
    "chargeId" TEXT,
    "photoKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "meter_reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "payee" TEXT,
    "proofKey" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT,
    "kind" "AnomalyKind" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intent_idempotencyKey_key" ON "payment_intent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_intent_accountId_idx" ON "payment_intent"("accountId");

-- CreateIndex
CREATE INDEX "payment_intent_occupancyId_idx" ON "payment_intent"("occupancyId");

-- CreateIndex
CREATE INDEX "payment_intent_status_idx" ON "payment_intent"("status");

-- CreateIndex
CREATE INDEX "payment_intent_providerRef_idx" ON "payment_intent"("providerRef");

-- CreateIndex
CREATE INDEX "contract_accountId_idx" ON "contract"("accountId");

-- CreateIndex
CREATE INDEX "contract_tenantId_idx" ON "contract"("tenantId");

-- CreateIndex
CREATE INDEX "contract_occupancyId_idx" ON "contract"("occupancyId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_accountId_reference_key" ON "contract"("accountId", "reference");

-- CreateIndex
CREATE INDEX "inspection_accountId_idx" ON "inspection"("accountId");

-- CreateIndex
CREATE INDEX "inspection_occupancyId_kind_idx" ON "inspection"("occupancyId", "kind");

-- CreateIndex
CREATE INDEX "inspection_item_inspectionId_idx" ON "inspection_item"("inspectionId");

-- CreateIndex
CREATE INDEX "maintenance_ticket_accountId_idx" ON "maintenance_ticket"("accountId");

-- CreateIndex
CREATE INDEX "maintenance_ticket_siteId_idx" ON "maintenance_ticket"("siteId");

-- CreateIndex
CREATE INDEX "maintenance_ticket_status_idx" ON "maintenance_ticket"("status");

-- CreateIndex
CREATE INDEX "maintenance_ticket_accountId_status_idx" ON "maintenance_ticket"("accountId", "status");

-- CreateIndex
CREATE INDEX "meter_accountId_idx" ON "meter"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "meter_unitId_type_key" ON "meter"("unitId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "meter_reading_chargeId_key" ON "meter_reading"("chargeId");

-- CreateIndex
CREATE INDEX "meter_reading_accountId_idx" ON "meter_reading"("accountId");

-- CreateIndex
CREATE INDEX "meter_reading_meterId_readAt_idx" ON "meter_reading"("meterId", "readAt");

-- CreateIndex
CREATE INDEX "expense_accountId_idx" ON "expense"("accountId");

-- CreateIndex
CREATE INDEX "expense_accountId_spentAt_idx" ON "expense"("accountId", "spentAt");

-- CreateIndex
CREATE INDEX "expense_category_idx" ON "expense"("category");

-- CreateIndex
CREATE INDEX "exchange_rate_accountId_idx" ON "exchange_rate"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_accountId_base_quote_key" ON "exchange_rate"("accountId", "base", "quote");

-- CreateIndex
CREATE INDEX "anomaly_accountId_resolvedAt_idx" ON "anomaly"("accountId", "resolvedAt");

-- CreateIndex
CREATE INDEX "anomaly_kind_idx" ON "anomaly"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "payment_paymentIntentId_key" ON "payment"("paymentIntentId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "occupancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection" ADD CONSTRAINT "inspection_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "occupancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_item" ADD CONSTRAINT "inspection_item_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter" ADD CONSTRAINT "meter_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter" ADD CONSTRAINT "meter_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_reading" ADD CONSTRAINT "meter_reading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly" ADD CONSTRAINT "anomaly_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly" ADD CONSTRAINT "anomaly_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

