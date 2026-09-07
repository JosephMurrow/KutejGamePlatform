-- CreateEnum
CREATE TYPE "RoomKind" AS ENUM ('PRIVATE', 'STREAM', 'HOME');

-- AlterTable
ALTER TABLE "private_rooms"
  ADD COLUMN "kind" "RoomKind" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "screenKey" TEXT;

-- Ключ экрана уникален, общим значением по умолчанию его не выдать: каждой
-- уже существующей комнате выписываем свой.
UPDATE "private_rooms"
SET "screenKey" = replace(gen_random_uuid()::text, '-', '')
WHERE "screenKey" IS NULL;

ALTER TABLE "private_rooms" ALTER COLUMN "screenKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "private_rooms_screenKey_key" ON "private_rooms"("screenKey");
