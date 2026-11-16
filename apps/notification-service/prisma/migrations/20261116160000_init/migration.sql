-- notification-service's own database (#68). One row per notification sent; written in
-- the same transaction as the send (#14), so the unique event_id is the dedupe key.

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_event_id_key" ON "notifications"("event_id");

-- CreateIndex
CREATE INDEX "notifications_order_id_idx" ON "notifications"("order_id");

-- Hand-written: Prisma cannot express CHECK constraints. The database rejects rows the
-- application should never write, whichever code path writes them.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_event_type_known"
    CHECK ("event_type" IN ('payment.succeeded.v1', 'payment.failed.v1')),
  ADD CONSTRAINT "notifications_channel_known" CHECK ("channel" IN ('log')),
  ADD CONSTRAINT "notifications_message_not_blank" CHECK (length(btrim("message")) > 0);
