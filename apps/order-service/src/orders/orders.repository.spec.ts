import { PrismaService } from '../prisma/prisma.service';
import { NewOrder } from './order';
import { OrdersRepository } from './orders.repository';

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
  const prismaOrder = { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
  const repository = new OrdersRepository({ order: prismaOrder } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('creates the order and its items in one nested write', async () => {
    prismaOrder.create.mockResolvedValue(row);
    const newOrder: NewOrder = {
      customerId: 'customer-1',
      currency: 'EUR',
      totalCents: 2500,
      items: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }],
    };

    await repository.create(newOrder);

    expect(prismaOrder.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-1',
        currency: 'EUR',
        totalCents: 2500,
        items: { create: [{ sku: 'SKU-1', quantity: 2, unitPriceCents: 1250 }] },
      },
      include: { items: true },
    });
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
});
