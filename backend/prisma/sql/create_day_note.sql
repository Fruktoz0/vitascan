-- DayNote: napi megjegyzés (egy sor / user / nap)

CREATE TABLE IF NOT EXISTS "DayNote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "loggedDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DayNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DayNote_userId_loggedDate_key" ON "DayNote"("userId", "loggedDate");
CREATE INDEX IF NOT EXISTS "DayNote_userId_loggedDate_idx" ON "DayNote"("userId", "loggedDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DayNote_userId_fkey'
  ) THEN
    ALTER TABLE "DayNote"
      ADD CONSTRAINT "DayNote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
