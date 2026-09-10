-- CreateTable
CREATE TABLE "chess"."ratings" (
    "userId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "deviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "games" INTEGER NOT NULL DEFAULT 0,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "botWins" INTEGER NOT NULL DEFAULT 0,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "chess"."pairs" (
    "lowId" TEXT NOT NULL,
    "highId" TEXT NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pairs_pkey" PRIMARY KEY ("lowId","highId")
);

-- CreateIndex
CREATE INDEX "ratings_rating_idx" ON "chess"."ratings"("rating");

-- AddForeignKey
ALTER TABLE "chess"."ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess"."pairs" ADD CONSTRAINT "pairs_lowId_fkey" FOREIGN KEY ("lowId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess"."pairs" ADD CONSTRAINT "pairs_highId_fkey" FOREIGN KEY ("highId") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
