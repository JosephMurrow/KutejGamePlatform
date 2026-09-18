-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "turbochess";

-- CreateEnum
CREATE TYPE "turbochess"."TurboMode" AS ENUM ('ONE_KIND', 'REINFORCEMENTS', 'ANNIHILATION', 'MEGA', 'BOOZE', 'NO_RETREAT', 'LAST_CHANCE', 'NUCLEAR', 'BATTLE_ROYALE', 'DOUBLE_AGENT', 'GIVEAWAY', 'BINGE', 'BLACK_MARKET', 'ZOMBIE', 'ANARCHY', 'SHOWDOWN');

-- CreateTable
CREATE TABLE "turbochess"."room_settings" (
    "roomId" TEXT NOT NULL,
    "mode" "turbochess"."TurboMode" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "room_settings_pkey" PRIMARY KEY ("roomId")
);
