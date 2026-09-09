-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chess";

-- CreateEnum
CREATE TYPE "chess"."ChessTimeControl" AS ENUM ('SEC_10', 'SEC_30', 'MIN_1', 'MIN_3', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "chess"."ChessOpponentKind" AS ENUM ('HUMAN', 'BOT');

-- CreateTable
CREATE TABLE "chess"."room_settings" (
    "roomId" TEXT NOT NULL,
    "timeControl" "chess"."ChessTimeControl" NOT NULL,
    "opponent" "chess"."ChessOpponentKind" NOT NULL,
    "streamerMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_settings_pkey" PRIMARY KEY ("roomId")
);
