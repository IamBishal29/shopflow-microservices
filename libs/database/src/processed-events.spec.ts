import { claimEvent } from './processed-events';
import { SqlClient } from './sql-client';

function txReturning(rows: number) {
  const executeRaw = jest
    .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
    .mockResolvedValue(rows);
  return { tx: { $executeRaw: executeRaw } as unknown as SqlClient, executeRaw };
}

describe('claimEvent', () => {
  it('claims an event the consumer has not processed yet', async () => {
    const { tx, executeRaw } = txReturning(1);
    await expect(claimEvent(tx, 'e-1', 'payment-service.order-created')).resolves.toBe(true);

    const [sql, eventId, consumer] = executeRaw.mock.calls[0] ?? [];
    expect(sql?.join('?')).toMatch(/INSERT INTO processed_events[\s\S]*ON CONFLICT/);
    expect([eventId, consumer]).toEqual(['e-1', 'payment-service.order-created']);
  });

  it('reports a duplicate when the row already exists, without throwing', async () => {
    const { tx } = txReturning(0);
    await expect(claimEvent(tx, 'e-1', 'payment-service.order-created')).resolves.toBe(false);
  });
});
