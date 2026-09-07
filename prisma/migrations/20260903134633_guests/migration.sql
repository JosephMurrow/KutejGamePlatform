-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guestRoomId" TEXT;

-- CreateIndex
CREATE INDEX "users_guestRoomId_idx" ON "users"("guestRoomId");

-- AddForeignKey
-- Каскад: комната умирает — гости уходят с ней, а за ними их ставки и раунды.
ALTER TABLE "users"
  ADD CONSTRAINT "users_guestRoomId_fkey"
  FOREIGN KEY ("guestRoomId") REFERENCES "private_rooms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
