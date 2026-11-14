import { HealthIndicatorService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';
import { SqlClient } from './sql-client';

describe('DatabaseHealthIndicator', () => {
  const queryRaw = jest.fn<Promise<unknown>, []>();
  const db = { $queryRaw: queryRaw } as unknown as SqlClient;
  const indicator = new DatabaseHealthIndicator(db, new HealthIndicatorService());

  afterEach(() => {
    queryRaw.mockReset();
    jest.useRealTimers();
  });

  it('reports up when SELECT 1 succeeds', async () => {
    queryRaw.mockResolvedValue([{ ok: 1 }]);
    await expect(indicator.pingCheck('database')).resolves.toEqual({
      database: { status: 'up' },
    });
  });

  it('reports down with the reason when the query fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(indicator.pingCheck('database')).resolves.toEqual({
      database: { status: 'down', message: 'connection refused' },
    });
  });

  it('reports down when the database does not answer within 1s', async () => {
    jest.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => undefined));
    const result = indicator.pingCheck('database');
    await jest.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({
      database: { status: 'down', message: 'timed out after 1000ms' },
    });
  });
});
