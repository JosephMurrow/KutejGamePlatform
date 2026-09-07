-- AlterTable
ALTER TABLE "private_rooms"
  ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxPlayers" INTEGER;
