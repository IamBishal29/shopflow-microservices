-- Idempotent consumers (#11, used by the payment results consumer in #13): which events each handler has already processed.
CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id", "consumer")
);
