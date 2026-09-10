-- CreateEnum
CREATE TYPE "chess"."ChessBotLevel" AS ENUM ('EASY', 'NORMAL', 'HARD', 'EXPERT');

-- AlterTable
ALTER TABLE "chess"."room_settings" ADD COLUMN     "botLevel" "chess"."ChessBotLevel" NOT NULL DEFAULT 'NORMAL';
