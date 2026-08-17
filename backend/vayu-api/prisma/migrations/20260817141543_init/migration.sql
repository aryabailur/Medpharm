-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('MANUFACTURED', 'QC_APPROVED', 'QC_FAILED', 'WAREHOUSED', 'DISPATCHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "QCResult" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('PHC', 'CHC', 'DISTRICT_HOSPITAL', 'WAREHOUSE', 'RETAIL');

-- CreateEnum
CREATE TYPE "SupplyOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIAL', 'REJECTED', 'DISPATCHED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('SIMULATED', 'DEVICE');

-- CreateEnum
CREATE TYPE "ExcursionSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('BREAKAGE', 'QTY_MISMATCH', 'SEAL_TAMPERED', 'TEMP_DAMAGE', 'WRONG_ITEM', 'NEAR_EXPIRY');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AssignedTeam" AS ENUM ('QC', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "OutboundEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Drug" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "nlemCode" TEXT,
    "category" TEXT,
    "packSize" TEXT,
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "shelfLifeDays" INTEGER,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "mfgDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "qrPayload" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'MANUFACTURED',

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "result" "QCResult" NOT NULL,
    "inspector" TEXT,
    "notes" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certificateUrl" TEXT,

    CONSTRAINT "QCRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL,
    "district" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "population" INTEGER,
    "tier" TEXT,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "SupplyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "requestedWindow" TEXT,
    "rejectionReason" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "qtyRequested" INTEGER NOT NULL,
    "qtyApproved" INTEGER,

    CONSTRAINT "SupplyOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "originWarehouseId" TEXT,
    "destinationInstitution" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "dispatchedAt" TIMESTAMP(3),
    "etaAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "routePolyline" TEXT,
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "excursionCount" INTEGER NOT NULL DEFAULT 0,
    "lastKnownLat" DOUBLE PRECISION,
    "lastKnownLng" DOUBLE PRECISION,
    "lastTempC" DOUBLE PRECISION,
    "progressPct" DOUBLE PRECISION,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentBatch" (
    "shipmentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ShipmentBatch_pkey" PRIMARY KEY ("shipmentId","batchId")
);

-- CreateTable
CREATE TABLE "TelemetryPoint" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "tempC" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "source" "TelemetrySource" NOT NULL DEFAULT 'SIMULATED',
    "deviceId" TEXT,

    CONSTRAINT "TelemetryPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Excursion" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minTempC" DOUBLE PRECISION,
    "maxTempC" DOUBLE PRECISION,
    "durationMin" INTEGER,
    "severity" "ExcursionSeverity" NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Excursion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "batchId" TEXT,
    "institutionId" TEXT,
    "category" "ComplaintCategory" NOT NULL,
    "description" TEXT,
    "photoUrls" TEXT[],
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTeam" "AssignedTeam",
    "resolutionNotes" TEXT,
    "rcaJson" JSONB,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionFeed" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "opening" INTEGER,
    "received" INTEGER,
    "dispensed" INTEGER,
    "closing" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumptionFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "OutboundEventStatus" NOT NULL DEFAULT 'PENDING',
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
CREATE INDEX "Batch_drugId_idx" ON "Batch"("drugId");

-- CreateIndex
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

-- CreateIndex
CREATE INDEX "QCRecord_batchId_idx" ON "QCRecord"("batchId");

-- CreateIndex
CREATE INDEX "Institution_district_idx" ON "Institution"("district");

-- CreateIndex
CREATE INDEX "SupplyOrder_status_idx" ON "SupplyOrder"("status");

-- CreateIndex
CREATE INDEX "SupplyOrder_institutionId_idx" ON "SupplyOrder"("institutionId");

-- CreateIndex
CREATE INDEX "SupplyOrderLine_orderId_idx" ON "SupplyOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_supplyOrderId_idx" ON "Shipment"("supplyOrderId");

-- CreateIndex
CREATE INDEX "TelemetryPoint_shipmentId_ts_idx" ON "TelemetryPoint"("shipmentId", "ts");

-- CreateIndex
CREATE INDEX "Excursion_shipmentId_idx" ON "Excursion"("shipmentId");

-- CreateIndex
CREATE INDEX "Complaint_status_filedAt_idx" ON "Complaint"("status", "filedAt");

-- CreateIndex
CREATE INDEX "ConsumptionFeed_institutionId_drugId_idx" ON "ConsumptionFeed"("institutionId", "drugId");

-- CreateIndex
CREATE INDEX "OutboundEvent_status_nextRetryAt_idx" ON "OutboundEvent"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCRecord" ADD CONSTRAINT "QCRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderLine" ADD CONSTRAINT "SupplyOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderLine" ADD CONSTRAINT "SupplyOrderLine_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentBatch" ADD CONSTRAINT "ShipmentBatch_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentBatch" ADD CONSTRAINT "ShipmentBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetryPoint" ADD CONSTRAINT "TelemetryPoint_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Excursion" ADD CONSTRAINT "Excursion_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionFeed" ADD CONSTRAINT "ConsumptionFeed_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionFeed" ADD CONSTRAINT "ConsumptionFeed_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
