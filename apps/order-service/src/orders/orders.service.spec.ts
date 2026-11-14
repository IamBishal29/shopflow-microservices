import { OrderNotFoundError, OrderTotalTooLargeError } from './order.errors';
import { NewOrder, Order } from './order';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const orderId = '6f1c2b8e-0c5e-4f8a-9d2e-1a2b3c4d5e6f';
const savedOrder: Order = {
  id: orderId,
  customerId: 'customer-1',
  currency: 'EUR',
  totalCents: 3700,
  status: 'PENDING',
  items: [
    { sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 },
    { sku: 'SKU-2', quantity: 1, unitPriceCents: 1200 },
  ],
  createdAt: new Date('2026-11-14T10:00:00.000Z'),
  updatedAt: new Date('2026-11-14T10:00:00.000Z'),
};

describe('OrdersService', () => {
  const repo = {
    create: jest.fn<Promise<Order>, [NewOrder, (order: Order) => unknown]>(),
    findById: jest.fn<Promise<Order | null>, [string]>(),
    list: jest.fn<Promise<readonly Order[]>, [{ limit: number; offset: number }]>(),
  };
  const service = new OrdersService(repo as unknown as OrdersRepository);

  beforeEach(() => jest.resetAllMocks());

  it('computes the total from the items before saving', async () => {
    repo.create.mockResolvedValue(savedOrder);

    await service.create({
      customerId: 'customer-1',
      currency: 'EUR',
      items: savedOrder.items,
    });

    expect(repo.create).toHaveBeenCalledWith(
      {
        customerId: 'customer-1',
        currency: 'EUR',
        items: savedOrder.items,
        totalCents: 2 * 1250 + 1 * 1200,
      },
      expect.any(Function),
    );
  });

  it('records an order.created.v1 event for the saved order', async () => {
    repo.create.mockResolvedValue(savedOrder);
    await service.create({ customerId: 'customer-1', currency: 'EUR', items: savedOrder.items });

    const toEvent = repo.create.mock.calls[0]?.[1];
    expect(toEvent?.(savedOrder)).toMatchObject({
      type: 'order.created.v1',
      payload: { orderId, totalCents: 3700 },
    });
  });

  it('rejects an order whose total does not fit the database column', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      sku: `SKU-${i}`,
      quantity: 1000,
      unitPriceCents: 10_000_000,
    }));

    await expect(
      service.create({ customerId: 'customer-1', currency: 'EUR', items }),
    ).rejects.toBeInstanceOf(OrderTotalTooLargeError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('returns the order when it exists', async () => {
    repo.findById.mockResolvedValue(savedOrder);
    await expect(service.findById(orderId)).resolves.toBe(savedOrder);
  });

  it('throws OrderNotFoundError for an unknown order id', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById(orderId)).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('returns a page with the paging parameters echoed back', async () => {
    repo.list.mockResolvedValue([savedOrder]);
    await expect(service.list({ limit: 20, offset: 40 })).resolves.toEqual({
      items: [savedOrder],
      limit: 20,
      offset: 40,
    });
  });
});
