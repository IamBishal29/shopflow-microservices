import { SqlClient } from './sql-client';

/**
 * Idempotent consumer: records that `consumer` handled `eventId`, inside the same
 * transaction as the handler's side effect. Returns false when it was already handled,
 * so the caller skips the side effect and the offset can be committed.
 *
 * Uses ON CONFLICT DO NOTHING instead of catching a unique violation: in Postgres any
 * error aborts the whole transaction, so the side effect could not run afterwards.
 *
 * Needs the standard table in the service's database:
 *   processed_events (event_id uuid, consumer text, processed_at timestamptz,
 *                     PRIMARY KEY (event_id, consumer))
 */
export async function claimEvent(
  tx: SqlClient,
  eventId: string,
  consumer: string,
): Promise<boolean> {
  const inserted = await tx.$executeRaw`
    INSERT INTO processed_events (event_id, consumer)
    VALUES (${eventId}::uuid, ${consumer})
    ON CONFLICT (event_id, consumer) DO NOTHING`;
  return inserted === 1;
}
