-- CreateTable
CREATE TABLE "SeasonTotal" (
    "userId" TEXT NOT NULL,
    "seasonKey" TEXT NOT NULL,
    "verticalM" DOUBLE PRECISION NOT NULL,
    "uphillM" DOUBLE PRECISION NOT NULL,
    "days" INTEGER NOT NULL,
    "resorts" INTEGER NOT NULL,
    "backcountryDays" INTEGER NOT NULL,
    "bestDayM" DOUBLE PRECISION NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "skiTimeS" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonTotal_pkey" PRIMARY KEY ("userId","seasonKey")
);

-- CreateIndex
CREATE INDEX "SeasonTotal_seasonKey_verticalM_idx" ON "SeasonTotal"("seasonKey", "verticalM");

-- CreateIndex
CREATE INDEX "SeasonTotal_seasonKey_days_idx" ON "SeasonTotal"("seasonKey", "days");

-- CreateIndex
CREATE INDEX "SeasonTotal_seasonKey_resorts_idx" ON "SeasonTotal"("seasonKey", "resorts");

-- CreateIndex
CREATE INDEX "SeasonTotal_seasonKey_bestDayM_idx" ON "SeasonTotal"("seasonKey", "bestDayM");

-- CreateIndex
CREATE INDEX "SeasonTotal_seasonKey_uphillM_idx" ON "SeasonTotal"("seasonKey", "uphillM");

-- AddForeignKey
ALTER TABLE "SeasonTotal" ADD CONSTRAINT "SeasonTotal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
