-- CreateTable
CREATE TABLE "master_calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'HOLIDAY',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "external_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_calendar_events_external_id_key" ON "master_calendar_events"("external_id");

-- CreateIndex
CREATE INDEX "master_calendar_events_date_idx" ON "master_calendar_events"("date");

-- AddForeignKey
ALTER TABLE "master_calendar_events" ADD CONSTRAINT "master_calendar_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
