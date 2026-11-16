import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { notificationFor } from './notification';
import { NotificationsRepository, SEND_TIMEOUT_MS } from './notifications.repository';
import { paymentSucceeded } from './payment-event.fixtures';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on event_id', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('NotificationsRepository', () => {
  const notification = notificationFor(paymentSucceeded);
  const create = jest.fn();
  const tx = { notification: { create } };
  // Like Prisma: run the callback; if it throws, the transaction (and the insert) is undone.
  const $transaction = jest.fn((work: (client: typeof tx) => Promise<void>) => work(tx));
  const repository = new NotificationsRepository({ $transaction } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({});
  });

  it('inserts the row, then delivers, inside one transaction with a timeout', async () => {
    const order: string[] = [];
    create.mockImplementation(() => order.push('insert'));
    const deliver = jest.fn(() => {
      order.push('deliver');
      return Promise.resolve();
    });

    await expect(repository.recordAndSend(notification, 'log', deliver)).resolves.toBe('sent');

    expect(order).toEqual(['insert', 'deliver']);
    expect(create).toHaveBeenCalledWith({ data: { ...notification, channel: 'log' } });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: SEND_TIMEOUT_MS });
  });

  it('reports a duplicate and never delivers when the event was already notified', async () => {
    create.mockRejectedValue(uniqueViolation());
    const deliver = jest.fn();

    await expect(repository.recordAndSend(notification, 'log', deliver)).resolves.toBe('duplicate');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('rethrows a failed delivery, so the row rolls back and Kafka retries the event', async () => {
    const deliver = jest.fn().mockRejectedValue(new Error('smtp down'));
    await expect(repository.recordAndSend(notification, 'log', deliver)).rejects.toThrow(
      'smtp down',
    );
  });

  it('rethrows other database errors (transient: retried, not treated as duplicates)', async () => {
    create.mockRejectedValue(new Error('connection reset'));
    await expect(repository.recordAndSend(notification, 'log', jest.fn())).rejects.toThrow(
      'connection reset',
    );
  });
});
