-- CreateEnum
CREATE TYPE "LinkPurpose" AS ENUM ('EMAIL_CONFIRM', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "one_time_links" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "LinkPurpose" NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "one_time_links_tokenHash_key" ON "one_time_links"("tokenHash");

-- CreateIndex
CREATE INDEX "one_time_links_userId_purpose_idx" ON "one_time_links"("userId", "purpose");

-- CreateIndex
CREATE INDEX "one_time_links_expiresAt_idx" ON "one_time_links"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "one_time_links" ADD CONSTRAINT "one_time_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

