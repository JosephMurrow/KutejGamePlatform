-- CreateEnum
CREATE TYPE "turbochess"."TurboBotLevel" AS ENUM ('EASY', 'NORMAL', 'HARD', 'EXPERT');

-- AlterTable
ALTER TABLE "turbochess"."matches" ADD COLUMN     "bots" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "turbochess"."room_settings" ADD COLUMN     "botLevel" "turbochess"."TurboBotLevel" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "bots" INTEGER NOT NULL DEFAULT 0;

