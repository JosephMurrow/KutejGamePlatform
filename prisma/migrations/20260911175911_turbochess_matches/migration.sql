-- CreateEnum
CREATE TYPE "turbochess"."TurboTimeControl" AS ENUM ('SEC_10', 'SEC_30', 'MIN_1', 'MIN_3', 'UNLIMITED');

-- AlterEnum
ALTER TYPE "turbochess"."TurboMode" ADD VALUE 'CLASSIC';

-- AlterTable
ALTER TABLE "turbochess"."room_settings" ADD COLUMN     "timeControl" "turbochess"."TurboTimeControl" NOT NULL DEFAULT 'SEC_30';

-- CreateTable
CREATE TABLE "turbochess"."matches" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "mode" "turbochess"."TurboMode" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "seed" INTEGER NOT NULL,
    "timeControl" "turbochess"."TurboTimeControl" NOT NULL,
    "moves" TEXT[],
    "times" INTEGER[],
    "winner" INTEGER,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turbochess"."match_seats" (
    "matchId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "match_seats_pkey" PRIMARY KEY ("matchId","seat")
);

-- CreateIndex
CREATE INDEX "matches_roomKey_endedAt_idx" ON "turbochess"."matches"("roomKey", "endedAt");

-- CreateIndex
CREATE INDEX "match_seats_userId_idx" ON "turbochess"."match_seats"("userId");

-- AddForeignKey
ALTER TABLE "turbochess"."match_seats" ADD CONSTRAINT "match_seats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "turbochess"."matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turbochess"."match_seats" ADD CONSTRAINT "match_seats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
