-- CreateTable: server-managed Eskiz JWT cache per tenant. Token is the
-- JWT returned by /auth/login; expiresAt is set to ~29 days from issue
-- (Eskiz JWTs last ~30) so we refresh slightly before they expire.
CREATE TABLE "eskiz_token_cache" (
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eskiz_token_cache_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "eskiz_token_cache" ADD CONSTRAINT "eskiz_token_cache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Clear seed/sample tags across every tenant.
-- The seed dropped a fixed sample set on every reseed; remove those rows
-- and any CardTag attachments first (cards survive — they just lose the
-- removed tag). Operators / tenant admins can recreate the labels they
-- actually use via Settings.
-- Names match seed-acoustic.js TAGS.
DELETE FROM "card_tags"
WHERE "tagId" IN (
  SELECT "id" FROM "tags"
  WHERE "name" IN ('VIP', 'qiziqish_yuqori', 'shikoyat', 'narx_so''rovi', 'filial_tashrifi', 'qaytarish')
);

DELETE FROM "tags"
WHERE "name" IN ('VIP', 'qiziqish_yuqori', 'shikoyat', 'narx_so''rovi', 'filial_tashrifi', 'qaytarish');
