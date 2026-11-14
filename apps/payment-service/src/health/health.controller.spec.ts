import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { DatabaseHealthIndicator } from '@shopflow/database';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const okResult: HealthCheckResult = { status: 'ok', info: {}, error: {}, details: {} };
  const check = jest.fn<Promise<HealthCheckResult>, [Array<() => Promise<unknown>>]>();
  const pingCheck = jest.fn();

  let controller: HealthController;

  beforeEach(async () => {
    check.mockReset().mockResolvedValue(okResult);
    pingCheck.mockReset().mockResolvedValue({ database: { status: 'up' } });
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: { check } },
        { provide: DatabaseHealthIndicator, useValue: { pingCheck } },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('liveness checks no external dependencies', async () => {
    await expect(controller.check()).resolves.toEqual(okResult);
    expect(check).toHaveBeenCalledWith([]);
  });

  it('readiness pings the database', async () => {
    await controller.ready();
    const indicators = check.mock.calls[0]?.[0] ?? [];
    expect(indicators).toHaveLength(1);
    await indicators[0]?.();
    expect(pingCheck).toHaveBeenCalledWith('database');
  });
});
