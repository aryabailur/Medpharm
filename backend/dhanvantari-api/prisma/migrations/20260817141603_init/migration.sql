-- CreateTable
CREATE TABLE "Drug" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "nlemCode" TEXT,
    "category" TEXT,
    "packSize" TEXT,
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "unitPrice" DOUBLE PRECISION,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "batchRef" TEXT,
    "qtyOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "expiryDate" TIMESTAMP(3),
    "location" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispense" (
    "id" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "batchRef" TEXT,
    "qty" INTEGER NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedBy" TEXT,
    "patientRef" TEXT,

    CONSTRAINT "Dispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingShipment" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT,
    "status" TEXT NOT NULL,
    "etaAt" TIMESTAMP(3),
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "anomalyFlag" BOOLEAN NOT NULL DEFAULT false,
    "lastKnownLat" DOUBLE PRECISION,
    "lastKnownLng" DOUBLE PRECISION,
    "lastTempC" DOUBLE PRECISION,
    "progressPct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedBatch" (
    "id" TEXT NOT NULL,
    "incomingShipmentId" TEXT,
    "drugRef" TEXT,
    "qtyExpected" INTEGER,
    "qtyReceived" INTEGER,
    "conditionPhotoUrls" TEXT[],
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedBy" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReceivedBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalComplaint" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "shipmentId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "photoUrls" TEXT[],
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remoteStatus" TEXT,
    "rcaSummary" TEXT,

    CONSTRAINT "LocalComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierScore" (
    "supplierId" TEXT NOT NULL,
    "onTimePct" DOUBLE PRECISION,
    "rejectionRatePct" DOUBLE PRECISION,
    "priceVariancePct" DOUBLE PRECISION,
    "excursionRate" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierScore_pkey" PRIMARY KEY ("supplierId")
);

-- CreateTable
CREATE TABLE "OutboundEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Drug_nlemCode_key" ON "Drug"("nlemCode");

-- CreateIndex
CREATE INDEX "Inventory_drugId_idx" ON "Inventory"("drugId");

-- CreateIndex
CREATE INDEX "Inventory_expiryDate_idx" ON "Inventory"("expiryDate");

-- CreateIndex
CREATE INDEX "Dispense_drugId_dispensedAt_idx" ON "Dispense"("drugId", "dispensedAt");

-- CreateIndex
CREATE INDEX "IncomingShipment_status_idx" ON "IncomingShipment"("status");

-- CreateIndex
CREATE INDEX "ReceivedBatch_incomingShipmentId_idx" ON "ReceivedBatch"("incomingShipmentId");

-- CreateIndex
CREATE INDEX "LocalComplaint_remoteStatus_idx" ON "LocalComplaint"("remoteStatus");

-- CreateIndex
CREATE INDEX "OutboundEvent_status_nextRetryAt_idx" ON "OutboundEvent"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedBatch" ADD CONSTRAINT "ReceivedBatch_incomingShipmentId_fkey" FOREIGN KEY ("incomingShipmentId") REFERENCES "IncomingShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
