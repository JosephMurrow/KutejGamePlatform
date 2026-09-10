-- CreateEnum
CREATE TYPE "chess"."ChessResult" AS ENUM ('WHITE', 'BLACK', 'DRAW');

-- CreateTable
CREATE TABLE "chess"."matches" (
    "id" TEXT NOT NULL,
    "roomKey" TEXT NOT NULL,
    "whiteId" TEXT NOT NULL,
    "blackId" TEXT NOT NULL,
    "whiteName" TEXT NOT NULL,
    "blackName" TEXT NOT NULL,
    "whiteRating" INTEGER NOT NULL,
    "blackRating" INTEGER NOT NULL,
    "moves" TEXT[],
    "times" INTEGER[],
    "result" "chess"."ChessResult" NOT NULL,
    "reason" TEXT NOT NULL,
    "timeControl" "chess"."ChessTimeControl" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_roomKey_endedAt_idx" ON "chess"."matches"("roomKey", "endedAt");

-- CreateIndex
CREATE INDEX "matches_whiteId_idx" ON "chess"."matches"("whiteId");

-- CreateIndex
CREATE INDEX "matches_blackId_idx" ON "chess"."matches"("blackId");

-- AddForeignKey
ALTER TABLE "chess"."matches" ADD CONSTRAINT "matches_whiteId_fkey" FOREIGN KEY ("whiteId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess"."matches" ADD CONSTRAINT "matches_blackId_fkey" FOREIGN KEY ("blackId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
