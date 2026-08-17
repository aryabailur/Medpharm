-- AlterTable
ALTER TABLE "Drug" ADD COLUMN     "abcClass" TEXT,
ADD COLUMN     "form" TEXT,
ADD COLUMN     "seasonalProfile" TEXT,
ADD COLUMN     "strength" TEXT,
ADD COLUMN     "tierMin" TEXT,
ADD COLUMN     "unitCostInr" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "beds" INTEGER,
ADD COLUMN     "block" TEXT,
ADD COLUMN     "districtId" TEXT,
ADD COLUMN     "hasColdChain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyOpdAvg" INTEGER,
ADD COLUMN     "parentInstitutionId" TEXT,
ADD COLUMN     "staffCount" INTEGER;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reliabilityProfile" TEXT,
    "quotedLeadTimeDays" INTEGER,
    "gstin" TEXT,
    "contactEmail" TEXT,
    "empanelledSince" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "institutionId" TEXT NOT NULL,
    "districtId" TEXT,
    "vendorId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "unitPriceInr" DOUBLE PRECISION,
    "cataloguePriceInr" DOUBLE PRECISION,
    "priceVariancePct" DOUBLE PRECISION,
    "expectedDeliveryDate" TIMESTAMP(3),
    "actualDeliveryDate" TIMESTAMP(3),
    "leadTimeDays" INTEGER,
    "delayDays" INTEGER,
    "onTime" BOOLEAN NOT NULL DEFAULT false,
    "qtyReceived" INTEGER,
    "qtyRejected" INTEGER,
    "qtyShortSupplied" INTEGER,
    "rejectionReason" TEXT,
    "status" TEXT,
    "orderValueInr" DOUBLE PRECISION,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "institutionId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "openingStock" INTEGER NOT NULL,
    "received" INTEGER NOT NULL,
    "dispensed" INTEGER NOT NULL,
    "expiredDamaged" INTEGER NOT NULL,
    "closingStock" INTEGER NOT NULL,
    "estimatedTrueDemand" INTEGER,
    "unmetDemand" INTEGER,
    "stockoutDays" INTEGER,
    "qtyIndentedOrIssued" INTEGER,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentStock" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL,
    "avgMonthlyConsumption" DOUBLE PRECISION,
    "monthsOfStock" DOUBLE PRECISION,
    "reorderLevel" INTEGER,
    "belowReorder" BOOLEAN NOT NULL DEFAULT false,
    "asOfMonth" TIMESTAMP(3),

    CONSTRAINT "CurrentStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseSignal" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "districtId" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "disease" TEXT NOT NULL,
    "cases" INTEGER NOT NULL,
    "incidencePer100k" DOUBLE PRECISION,
    "outbreakFlag" BOOLEAN NOT NULL DEFAULT false,
    "cases3mAvg" DOUBLE PRECISION,
    "trendPctVs3mAvg" DOUBLE PRECISION,

    CONSTRAINT "DiseaseSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_poDate_idx" ON "PurchaseOrder"("vendorId", "poDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_drugId_idx" ON "PurchaseOrder"("drugId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_institutionId_idx" ON "PurchaseOrder"("institutionId");

-- CreateIndex
CREATE INDEX "StockLedger_institutionId_drugId_month_idx" ON "StockLedger"("institutionId", "drugId", "month");

-- CreateIndex
CREATE INDEX "StockLedger_drugId_month_idx" ON "StockLedger"("drugId", "month");

-- CreateIndex
CREATE INDEX "StockLedger_month_idx" ON "StockLedger"("month");

-- CreateIndex
CREATE INDEX "CurrentStock_belowReorder_idx" ON "CurrentStock"("belowReorder");

-- CreateIndex
CREATE UNIQUE INDEX "CurrentStock_institutionId_drugId_key" ON "CurrentStock"("institutionId", "drugId");

-- CreateIndex
CREATE INDEX "DiseaseSignal_districtId_month_idx" ON "DiseaseSignal"("districtId", "month");

-- CreateIndex
CREATE INDEX "DiseaseSignal_disease_month_idx" ON "DiseaseSignal"("disease", "month");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentStock" ADD CONSTRAINT "CurrentStock_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentStock" ADD CONSTRAINT "CurrentStock_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

