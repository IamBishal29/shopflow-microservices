-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- The relay only ever reads unpublished rows, oldest first. A partial index stays tiny
-- (just the backlog) no matter how many published rows the table keeps.
CREATE INDEX "outbox_unpublished_idx" ON "outbox" ("created_at", "id") WHERE "published_at" IS NULL;
