import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewOrder, Order, PageRequest } from './order';

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** Persistence for orders. The only class in order-service that talks to Prisma about orders. */
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Inserts the order and its items atomically (one nested write = one transaction). */
  async create(order: NewOrder): Promise<Order> {
    const row = await this.prisma.order.create({
      data: {
        customerId: order.customerId,
        currency: order.currency,
        totalCents: order.totalCents,
        items: {
          create: order.items.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
          })),
        },
      },
      include: { items: true },
    });
    return toOrder(row);
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    return row ? toOrder(row) : null;
  }

  /** Newest first; `id` breaks ties so pages are stable when timestamps collide. */
  async list(page: PageRequest): Promise<readonly Order[]> {
    const rows = await this.prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.offset,
      take: page.limit,
      include: { items: true },
    });
    return rows.map(toOrder);
  }
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customerId,
    totalCents: row.totalCents,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  };
}
