import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../config/env.validation';
import { orderCreated, orderId, succeededPayment } from './fixtures';
import { NewPayment, Payment } from './payment';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

function setup(declineAboveCents = 10_000) {
  const repository = {
    record: jest
      .fn<Promise<Payment | null>, [string, NewPayment, (p: Payment) => unknown]>()
      .mockResolvedValue(succeededPayment),
  };
  const config = { get: jest.fn().mockReturnValue(declineAboveCents) };
  const service = new PaymentsService(
    repository as unknown as PaymentsRepository,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  return { repository, service };
}

describe('PaymentsService', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('records a successful payment for an order within the limit', async () => {
    const { repository, service } = setup();
    repository.record.mockResolvedValue(succeededPayment);

    await expect(service.handleOrderCreated(orderCreated(2500))).resolves.toBe(succeededPayment);
    expect(repository.record).toHaveBeenCalledWith(
      orderCreated().eventId,
      { orderId, amountCents: 2500, currency: 'EUR', status: 'SUCCEEDED' },
      expect.any(Function),
    );
  });

  it('records a declined payment for an order above the limit', async () => {
    const { repository, service } = setup(1000);
    await service.handleOrderCreated(orderCreated(1001));
    expect(repository.record).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'FAILED', reason: 'amount_over_limit' }),
      expect.any(Function),
    );
  });

  it('emits a result event that keeps the order correlation ID', async () => {
    const { repository, service } = setup();
    await service.handleOrderCreated(orderCreated());
    const toEvent = repository.record.mock.calls[0]?.[2];
    expect(toEvent?.(succeededPayment)).toMatchObject({
      type: 'payment.succeeded.v1',
      correlationId: 'req-7f3a',
    });
  });

  it('treats an already processed event as done (duplicate delivery)', async () => {
    const { repository, service } = setup();
    repository.record.mockResolvedValue(null);
    await expect(service.handleOrderCreated(orderCreated())).resolves.toBeNull();
  });
});
