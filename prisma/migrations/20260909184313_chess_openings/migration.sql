-- CreateTable
CREATE TABLE "chess"."openings" (
    "level" "chess"."ChessBotLevel" NOT NULL,
    "position" TEXT NOT NULL,
    "move" TEXT NOT NULL,

    CONSTRAINT "openings_pkey" PRIMARY KEY ("level","position","move")
);

-- CreateIndex
CREATE INDEX "openings_level_position_idx" ON "chess"."openings"("level", "position");
