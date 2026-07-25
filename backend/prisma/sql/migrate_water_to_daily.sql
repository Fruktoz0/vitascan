-- WaterLog: event sorok → napi összesítő (egy sor / user / nap)
-- Idempotens: csak akkor fut, ha még az régi amountMl oszlop létezik.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WaterLog'
      AND column_name = 'amountMl'
  ) THEN
    CREATE TABLE "WaterLog_daily" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "totalMl" INTEGER NOT NULL DEFAULT 0,
      "loggedDate" DATE NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "WaterLog_daily_pkey" PRIMARY KEY ("id")
    );

    INSERT INTO "WaterLog_daily" ("id", "userId", "totalMl", "loggedDate", "createdAt", "updatedAt")
    SELECT
      (array_agg(w."id" ORDER BY w."createdAt" ASC))[1],
      w."userId",
      SUM(w."amountMl")::INTEGER,
      (timezone('UTC', w."createdAt"))::date,
      MIN(w."createdAt"),
      MAX(w."createdAt")
    FROM "WaterLog" w
    GROUP BY w."userId", (timezone('UTC', w."createdAt"))::date;

    ALTER TABLE "WaterLog" DROP CONSTRAINT IF EXISTS "WaterLog_userId_fkey";
    DROP TABLE "WaterLog";
    ALTER TABLE "WaterLog_daily" RENAME TO "WaterLog";

    ALTER TABLE "WaterLog"
      ADD CONSTRAINT "WaterLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

    CREATE UNIQUE INDEX "WaterLog_userId_loggedDate_key"
      ON "WaterLog"("userId", "loggedDate");
    CREATE INDEX "WaterLog_userId_loggedDate_idx"
      ON "WaterLog"("userId", "loggedDate");
  END IF;
END $$;
