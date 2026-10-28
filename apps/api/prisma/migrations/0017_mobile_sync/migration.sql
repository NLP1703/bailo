-- Application mobile (LM2) : téléphones de l'équipe, trace des opérations hors-ligne
-- et suppressions à répercuter sur les téléphones.

-- CreateTable
CREATE TABLE "device" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "model" TEXT,
    "appVersion" TEXT,
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "oldestPendingAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_operation" (
    "opId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceKey" TEXT,
    "type" TEXT NOT NULL,
    "v" INTEGER NOT NULL,
    "siteId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "message" TEXT,
    "entityId" TEXT,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_operation_pkey" PRIMARY KEY ("opId")
);

-- CreateTable
CREATE TABLE "sync_tombstone" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_tombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_accountId_idx" ON "device"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "device_userId_deviceKey_key" ON "device"("userId", "deviceKey");

-- CreateIndex
CREATE INDEX "sync_operation_accountId_status_idx" ON "sync_operation"("accountId", "status");

-- CreateIndex
CREATE INDEX "sync_operation_userId_receivedAt_idx" ON "sync_operation"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "sync_tombstone_accountId_deletedAt_idx" ON "sync_tombstone"("accountId", "deletedAt");

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_operation" ADD CONSTRAINT "sync_operation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_tombstone" ADD CONSTRAINT "sync_tombstone_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
