-- AlterTable: LLM-extracted operator mistakes vs. the active sales script.
-- Shape: [{ section, severity ("low"|"medium"|"high"), message, evidence? }]
ALTER TABLE "analyses" ADD COLUMN     "mistakes" JSONB NOT NULL DEFAULT '[]';
