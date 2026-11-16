-- GET /orders is per customer since #61: WHERE customer_id = ? ORDER BY created_at DESC, id DESC.
-- Create the new index before dropping the old one, so the list is never without an index.
-- (On a large live table: CREATE INDEX CONCURRENTLY in its own migration.)

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_id_idx" ON "orders"("customer_id", "created_at" DESC, "id" DESC);

-- DropIndex
DROP INDEX "orders_customer_id_created_at_idx";
