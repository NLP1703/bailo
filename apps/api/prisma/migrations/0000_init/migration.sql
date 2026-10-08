-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'CARETAKER');

-- CreateEnum
CREATE TYPE "SiteType" AS ENUM ('CITE', 'IMMEUBLE', 'MIXTE');

-- CreateEnum
CREATE TYPE "ProrataMode" AS ENUM ('FULL', 'PRORATA');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('CHAMBRE', 'STUDIO', 'APPARTEMENT');

-- CreateEnum
CREATE TYPE "UnitManualStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'RESERVED');

-- CreateEnum
CREATE TYPE "OccupancyStatus" AS ENUM ('ACTIVE', 'NOTICE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('LOYER', 'CAUTION', 'EAU', 'ELECTRICITE', 'FRAIS', 'PENALITE', 'REPARATION');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('VALID', 'VOIDED');

-- CreateEnum
CREATE TYPE "ReminderStage" AS ENUM ('J_MINUS_3', 'J_0', 'J_PLUS_5', 'J_PLUS_15', 'END_OF_ADVANCE');

-- CreateEnum
CREATE TYPE "ReminderRecipient" AS ENUM ('TENANT', 'GUARANTOR', 'BOTH');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('DISCOVERY', 'CITE', 'CITE_PRO', 'MANAGER');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('EAU', 'ELECTRICITE', 'ENTRETIEN', 'REPARATION', 'SALAIRE', 'TAXE', 'AUTRE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('REMINDER', 'CONTRACT', 'RECEIPT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'VOID', 'CLOSE');

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "logoKey" TEXT,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'DISCOVERY',
    "subscriptionEndAt" TIMESTAMP(3),
    "receiptPrefix" TEXT NOT NULL DEFAULT 'CG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_site" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "user_site_pkey" PRIMARY KEY ("userId","siteId")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_code" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SiteType" NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "landmark" TEXT,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "prorataMode" "ProrataMode" NOT NULL DEFAULT 'FULL',
    "reminderJm3" BOOLEAN NOT NULL DEFAULT true,
    "reminderJ0" BOOLEAN NOT NULL DEFAULT true,
    "reminderJp5" BOOLEAN NOT NULL DEFAULT true,
    "reminderJp15" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "blockId" TEXT,
    "code" TEXT NOT NULL,
    "type" "UnitType" NOT NULL DEFAULT 'CHAMBRE',
    "baseRent" INTEGER NOT NULL,
    "chargesIncluded" BOOLEAN NOT NULL DEFAULT false,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "manualStatus" "UnitManualStatus" NOT NULL DEFAULT 'AVAILABLE',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "idDocType" TEXT,
    "idDocNumber" TEXT,
    "idDocKey" TEXT,
    "photoKey" TEXT,
    "occupation" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantor" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "relationship" TEXT,
    "isPrimaryPayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "guarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "plannedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "noticeDate" TIMESTAMP(3),
    "monthlyRent" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "status" "OccupancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "chargesGeneratedUntil" TIMESTAMP(3),
    "closeSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL,
    "periodMonth" INTEGER,
    "periodYear" INTEGER,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'UPCOMING',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occupancyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "proofKey" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'VALID',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_handover" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "expectedAmount" INTEGER NOT NULL,
    "handedAmount" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "cash_handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "unitId" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "attachmentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "stage" "ReminderStage" NOT NULL,
    "recipient" "ReminderRecipient" NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "stage" "ReminderStage",
    "bodyHtml" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequence" (
    "accountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_sequence_pkey" PRIMARY KEY ("accountId","year")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_phone_key" ON "account"("phone");

-- CreateIndex
CREATE INDEX "user_accountId_idx" ON "user"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "user_accountId_phone_key" ON "user"("accountId", "phone");

-- CreateIndex
CREATE INDEX "user_site_siteId_idx" ON "user_site"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_tokenHash_key" ON "refresh_token"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token"("userId");

-- CreateIndex
CREATE INDEX "otp_code_phone_purpose_idx" ON "otp_code"("phone", "purpose");

-- CreateIndex
CREATE INDEX "site_accountId_idx" ON "site"("accountId");

-- CreateIndex
CREATE INDEX "block_siteId_idx" ON "block"("siteId");

-- CreateIndex
CREATE INDEX "block_accountId_idx" ON "block"("accountId");

-- CreateIndex
CREATE INDEX "unit_accountId_idx" ON "unit"("accountId");

-- CreateIndex
CREATE INDEX "unit_siteId_idx" ON "unit"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_siteId_code_key" ON "unit"("siteId", "code");

-- CreateIndex
CREATE INDEX "tenant_accountId_idx" ON "tenant"("accountId");

-- CreateIndex
CREATE INDEX "tenant_accountId_name_idx" ON "tenant"("accountId", "name");

-- CreateIndex
CREATE INDEX "tenant_accountId_phone_idx" ON "tenant"("accountId", "phone");

-- CreateIndex
CREATE INDEX "guarantor_tenantId_idx" ON "guarantor"("tenantId");

-- CreateIndex
CREATE INDEX "guarantor_accountId_idx" ON "guarantor"("accountId");

-- CreateIndex
CREATE INDEX "occupancy_accountId_idx" ON "occupancy"("accountId");

-- CreateIndex
CREATE INDEX "occupancy_unitId_idx" ON "occupancy"("unitId");

-- CreateIndex
CREATE INDEX "occupancy_tenantId_idx" ON "occupancy"("tenantId");

-- CreateIndex
CREATE INDEX "occupancy_status_idx" ON "occupancy"("status");

-- CreateIndex
CREATE INDEX "charge_accountId_idx" ON "charge"("accountId");

-- CreateIndex
CREATE INDEX "charge_occupancyId_idx" ON "charge"("occupancyId");

-- CreateIndex
CREATE INDEX "charge_dueDate_idx" ON "charge"("dueDate");

-- CreateIndex
CREATE INDEX "charge_status_idx" ON "charge"("status");

-- CreateIndex
CREATE UNIQUE INDEX "charge_occupancyId_type_periodYear_periodMonth_key" ON "charge"("occupancyId", "type", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "payment_clientId_key" ON "payment"("clientId");

-- CreateIndex
CREATE INDEX "payment_accountId_idx" ON "payment"("accountId");

-- CreateIndex
CREATE INDEX "payment_occupancyId_idx" ON "payment"("occupancyId");

-- CreateIndex
CREATE INDEX "payment_receivedBy_idx" ON "payment"("receivedBy");

-- CreateIndex
CREATE INDEX "payment_paidAt_idx" ON "payment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accountId_receiptNumber_key" ON "payment"("accountId", "receiptNumber");

-- CreateIndex
CREATE INDEX "allocation_accountId_idx" ON "allocation"("accountId");

-- CreateIndex
CREATE INDEX "allocation_paymentId_idx" ON "allocation"("paymentId");

-- CreateIndex
CREATE INDEX "allocation_chargeId_idx" ON "allocation"("chargeId");

-- CreateIndex
CREATE INDEX "cash_handover_accountId_idx" ON "cash_handover"("accountId");

-- CreateIndex
CREATE INDEX "cash_handover_collectorId_idx" ON "cash_handover"("collectorId");

-- CreateIndex
CREATE INDEX "expense_accountId_idx" ON "expense"("accountId");

-- CreateIndex
CREATE INDEX "expense_siteId_idx" ON "expense"("siteId");

-- CreateIndex
CREATE INDEX "expense_spentAt_idx" ON "expense"("spentAt");

-- CreateIndex
CREATE INDEX "reminder_accountId_idx" ON "reminder"("accountId");

-- CreateIndex
CREATE INDEX "reminder_status_scheduledFor_idx" ON "reminder"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_chargeId_stage_key" ON "reminder"("chargeId", "stage");

-- CreateIndex
CREATE INDEX "template_accountId_kind_idx" ON "template"("accountId", "kind");

-- CreateIndex
CREATE INDEX "audit_log_accountId_entity_entityId_idx" ON "audit_log"("accountId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_accountId_createdAt_idx" ON "audit_log"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site" ADD CONSTRAINT "user_site_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_site" ADD CONSTRAINT "user_site_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site" ADD CONSTRAINT "site_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit" ADD CONSTRAINT "unit_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantor" ADD CONSTRAINT "guarantor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupancy" ADD CONSTRAINT "occupancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge" ADD CONSTRAINT "charge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge" ADD CONSTRAINT "charge_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "occupancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "occupancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation" ADD CONSTRAINT "allocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handover" ADD CONSTRAINT "cash_handover_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template" ADD CONSTRAINT "template_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequence" ADD CONSTRAINT "receipt_sequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

