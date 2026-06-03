-- AlterTable: per-call branch the customer asked about, set manually by the
-- operator. Drives the monthly per-branch report (calls / WON / LOST /
-- conversion %). Independent of User.branchId (operator's home branch).
ALTER TABLE "calls" ADD COLUMN "branchId" TEXT;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "calls_tenantId_branchId_idx" ON "calls"("tenantId", "branchId");
