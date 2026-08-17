-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "drugId" TEXT;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

