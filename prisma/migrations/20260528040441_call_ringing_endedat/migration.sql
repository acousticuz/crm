-- AlterEnum
ALTER TYPE "CallStatus" ADD VALUE 'RINGING';

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "endedAt" TIMESTAMP(3);
