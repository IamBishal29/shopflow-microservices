import { PrismaService } from '../prisma/prisma.service';
import { NewOrder } from './order';
import { OrderNotFoundError } from './order.errors';
import { OrdersRepository, PAYMENT_RESULTS_CONSUMER } from './orders.repository';

const createdAt = new Date('2026-11-14T10:00:00.000Z');
const orderId = '6f1c2b8e-0c5e-4f8a-9d2e-1a2b3c4d5e6f';
const row = {
  id: orderId,
  customerId: 'customer-1',
  totalCents: 2500,
  currency: 'EUR',
  status: 'PENDING' as const,
  createdAt,
  updatedAt: createdAt,
  items: [
    {
      id: 'b1d7c1a0-1111-4a4a-8b8b-000000000001',
      orderId,
      sku: 'SKU-1',
      quantity: 2,
      unitPriceCents: 1250,
    },
  ],
};

describe('OrdersRepository', () => {
  const prismaOrder = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  };
  const outboxEvent = { create: jest.fn() };
  const $executeRaw = jest.fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>();
  const tx = { order: prismaOrder, outboxEvent, $executeRaw };
  const $transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const repository = new OrdersRepository({
    order: prismaOrder,
    $transaction,
  } as unknown as PrismaService);

  const newOrder: NewOrder = {
    customerId: 'customer-1',
    currency: 'EUR',
    totalCents: 2500,
    items: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }],
  };
  const event = {
    eventId: '5d0c2f8a-1b3e-4f6a-8c9d-0e1f2a3b4c01',
    type: 'order.created.v1' as const,
    occurredAt: createdAt.toISOString(),
    correlationId: 'c-1',
    payload: { orderId },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaOrder.create.mockResolvedValue(row);
  });

  it('inserts the order with its items and the outbox row in one transaction', async () => {
    const created = await repository.create(newOrder, () => event);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(prismaOrder.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-1',
        currency: 'EUR',
        totalCents: 2500,
        items: { create: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }] },
      },
      include: { items: true },
    });
    expect(outboxEvent.create).toHaveBeenCalledWith({
      data: { id: event.eventId, aggregateId: orderId, type: 'order.created.v1', payload: event },
    });
    expect(created.id).toBe(orderId);
  });

  it('builds the event from the saved order, so it carries the database id', async () => {
    const toEvent = jest.fn().mockReturnValue(event);
    await repository.create(newOrder, toEvent);
    expect(toEvent).toHaveBeenCalledWith(expect.objectContaining({ id: orderId }));
  });

  it('fails the whole create when the outbox insert fails (no order without its event)', async () => {
    outboxEvent.create.mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(repository.create(newOrder, () => event)).rejects.toThrow('outbox insert failed');
  });

  it('maps rows to domain orders without leaking database columns', async () => {
    prismaOrder.findUnique.mockResolvedValue(row);
    await expect(repository.findById(orderId)).resolves.toEqual({
      id: orderId,
      customerId: 'customer-1',
      totalCents: 2500,
      currency: 'EUR',
      status: 'PENDING',
      createdAt,
      updatedAt: createdAt,
      items: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }],
    });
  });

  it('returns null when the order does not exist', async () => {
    prismaOrder.findUnique.mockResolvedValue(null);
    await expect(repository.findById(orderId)).resolves.toBeNull();
  });

  it('lists newest first with a stable tie-breaker and the requested page', async () => {
    prismaOrder.findMany.mockResolvedValue([row]);
    await expect(repository.list({ limit: 20, offset: 40 })).resolves.toHaveLength(1);
    expect(prismaOrder.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 40,
      take: 20,
      include: { items: true },
    });
  });

  describe('applyPaymentResult', () => {
    const eventId = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e01';

    beforeEach(() => $executeRaw.mockResolvedValue(1));

    it('moves a PENDING order to the outcome with a conditional update', async () => {
      prismaOrder.updateMany.mockResolvedValue({ count: 1 });

      await expect(repository.applyPaymentResult(eventId, orderId, 'PAID')).resolves.toEqual({
        result: 'applied',
      });
      expect(prismaOrder.updateMany).toHaveBeenCalledWith({
        where: { id: orderId, status: 'PENDING' },
        data: { status: 'PAID' },
      });
      const [, claimedId, consumer] = $executeRaw.mock.calls[0] ?? [];
      expect([claimedId, consumer]).toEqual([eventId, PAYMENT_RESULTS_CONSUMER]);
    });

    it('does nothing for an event that was already processed', async () => {
      $executeRaw.mockResolvedValue(0);
      await expect(repository.applyPaymentResult(eventId, orderId, 'PAID')).resolves.toEqual({
        result: 'duplicate',
      });
      expect(prismaOrder.updateMany).not.toHaveBeenCalled();
    });

    it('ignores a result for an order that is already final', async () => {
      prismaOrder.updateMany.mockResolvedValue({ count: 0 });
      prismaOrder.findUnique.mockResolvedValue({ status: 'PAID' });
      await expect(
        repository.applyPaymentResult(eventId, orderId, 'PAYMENT_FAILED'),
      ).resolves.toEqual({ result: 'ignored', current: 'PAID' });
    });

    it('throws OrderNotFoundError for an unknown order, rolling back the claim', async () => {
      prismaOrder.updateMany.mockResolvedValue({ count: 0 });
      prismaOrder.findUnique.mockResolvedValue(null);
      await expect(repository.applyPaymentResult(eventId, orderId, 'PAID')).rejects.toBeInstanceOf(
        OrderNotFoundError,
      );
    });
  });
});
