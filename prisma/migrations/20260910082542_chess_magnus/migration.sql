-- AlterEnum
ALTER TYPE "chess"."ChessBotLevel" ADD VALUE 'MAGNUS';

-- AlterTable
ALTER TABLE "chess"."ratings" ADD COLUMN     "expertWins" INTEGER NOT NULL DEFAULT 0;
