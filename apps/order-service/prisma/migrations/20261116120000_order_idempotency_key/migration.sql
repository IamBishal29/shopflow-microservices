-- End-to-end idempotency (#56): the client's Idempotency-Key, unique per customer. Existing rows get NULL (never conflicts).
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotency_key" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "orders_customer_id_idempotency_key_key" ON "orders"("customer_id", "idempotency_key");
