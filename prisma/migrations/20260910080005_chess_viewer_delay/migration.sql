-- CreateEnum
CREATE TYPE "chess"."ChessViewerDelay" AS ENUM ('NONE', 'SEC_15', 'SEC_30', 'SEC_60');

-- AlterTable
ALTER TABLE "chess"."room_settings" ADD COLUMN     "viewerDelay" "chess"."ChessViewerDelay" NOT NULL DEFAULT 'NONE';
