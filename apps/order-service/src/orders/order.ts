/** Domain types for orders. Services depend on these, never on Prisma's generated types. */
export const ORDER_STATUSES = ['PENDING', 'PAID', 'PAYMENT_FAILED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewOrder {
  readonly customerId: string;
  readonly currency: string;
  readonly totalCents: number;
  readonly items: readonly OrderItem[];
}

export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}
