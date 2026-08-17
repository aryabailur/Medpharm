-- AlterTable
ALTER TABLE "LocalComplaint" ADD COLUMN     "remoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LocalComplaint_remoteId_key" ON "LocalComplaint"("remoteId");

