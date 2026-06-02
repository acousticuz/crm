-- AlterTable: add provider-sync columns to sms_templates so templates fetched
-- from Eskiz/Play can be upserted idempotently by their external id and the UI
-- can show whether they are still approved (status="service").
ALTER TABLE "sms_templates" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" TEXT,
ADD COLUMN     "externalStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_tenantId_externalProvider_externalId_key" ON "sms_templates"("tenantId", "externalProvider", "externalId");
