import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { orderId } from './fixtures';
import { NewPayment } from './payment';
import { CONSUMER, PaymentsRepository } from './payments.repository';

const createdAt = new Date('2026-11-14T10:00:01.000Z');
const row = (status: 'SUCCEEDED' | 'FAILED', reason: string | null = null) => ({
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01',
  orderId,
  status,
  amountCents: 2500,
  currency: 'EUR',
  reason,
  createdAt,
});
const event = {
  eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c09',
  type: 'payment.succeeded.v1' as const,
  occurredAt: createdAt.toISOString(),
  correlationId: 'req-7f3a',
  payload: { orderId },
};
const sourceEventId = '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c01';
const approved: NewPayment = { orderId, amountCents: 2500, currency: 'EUR', status: 'SUCCEEDED' };

function setup() {
  const tx = {
    $executeRaw: jest
      .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
      .mockResolvedValue(1),
    payment: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { tx, repository: new PaymentsRepository(prisma as unknown as PrismaService) };
}

describe('PaymentsRepository', () => {
  it('inserts the payment and its outbox row in one transaction', async () => {
    const { tx, repository } = setup();
    tx.payment.create.mockResolvedValue(row('SUCCEEDED'));

    const payment = await repository.record(sourceEventId, approved, () => event);

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: { orderId, amountCents: 2500, currency: 'EUR', status: 'SUCCEEDED', reason: null },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        id: event.eventId,
        aggregateId: orderId,
        type: 'payment.succeeded.v1',
        payload: event,
      },
    });
    expect(payment).toMatchObject({ orderId, status: 'SUCCEEDED' });
  });

  it('stores the decline reason for a failed payment', async () => {
    const { tx, repository } = setup();
    tx.payment.create.mockResolvedValue(row('FAILED', 'amount_over_limit'));

    const payment = await repository.record(
      sourceEventId,
      { ...approved, status: 'FAILED', reason: 'amount_over_limit' },
      () => event,
    );

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', reason: 'amount_over_limit' }) as object,
    });
    expect(payment).toMatchObject({ status: 'FAILED', reason: 'amount_over_limit' });
  });

  it('marks the source event processed before the side effect, in the same transaction', async () => {
    const { tx, repository } = setup();
    tx.payment.create.mockResolvedValue(row('SUCCEEDED'));

    await repository.record(sourceEventId, approved, () => event);

    const [sql, eventId, consumer] = tx.$executeRaw.mock.calls[0] ?? [];
    expect(sql?.join('?')).toMatch(/INSERT INTO processed_events/);
    expect([eventId, consumer]).toEqual([sourceEventId, CONSUMER]);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.payment.create.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('skips the payment and the event when the source event was already processed', async () => {
    const { tx, repository } = setup();
    tx.$executeRaw.mockResolvedValue(0);

    await expect(repository.record(sourceEventId, approved, () => event)).resolves.toBeNull();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('returns null instead of charging twice when the order already has a payment', async () => {
    const { tx, repository } = setup();
    tx.payment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(repository.record(sourceEventId, approved, () => event)).resolves.toBeNull();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('rethrows other database errors so the message is retried', async () => {
    const { tx, repository } = setup();
    tx.payment.create.mockRejectedValue(new Error('connection lost'));
    await expect(repository.record(sourceEventId, approved, () => event)).rejects.toThrow(
      'connection lost',
    );
  });
});
