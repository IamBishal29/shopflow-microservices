-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");


-- Invariants Prisma's schema language cannot express (see order-service init migration).
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_cents_non_negative" CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "payments_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$'),
  -- A declined payment always says why; a successful one never carries a reason.
  ADD CONSTRAINT "payments_reason_iff_failed"
    CHECK (("status" = 'FAILED') = ("reason" IS NOT NULL));

-- The relay only reads unpublished rows; keep that index tiny.
CREATE INDEX "outbox_unpublished_idx" ON "outbox" ("created_at", "id") WHERE "published_at" IS NULL;
