-- CreateEnum
CREATE TYPE "HostRotation" AS ENUM ('CIRCLE', 'OWNER');

-- AlterTable
ALTER TABLE "private_rooms"
  ADD COLUMN "hostRotation" "HostRotation" NOT NULL DEFAULT 'CIRCLE';
