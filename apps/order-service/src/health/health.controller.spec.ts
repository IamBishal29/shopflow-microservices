import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const okResult: HealthCheckResult = { status: 'ok', info: {}, error: {}, details: {} };
  const check = jest.fn<Promise<HealthCheckResult>, Parameters<HealthCheckService['check']>>();

  let controller: HealthController;

  beforeEach(async () => {
    check.mockReset().mockResolvedValue(okResult);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthCheckService, useValue: { check } }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('reports ok without checking external dependencies (liveness)', async () => {
    await expect(controller.check()).resolves.toEqual(okResult);
    expect(check).toHaveBeenCalledWith([]);
  });
});
