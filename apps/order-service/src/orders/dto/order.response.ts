import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ORDER_STATUSES, Order, OrderItem, OrderStatus } from '../order';
import type { OrderPage } from '../orders.service';

// Documentation-only classes. `implements` makes the compiler flag a domain field that the
// docs forget; the handlers still return the plain domain objects.

@ApiSchema({ name: 'OrderItem' })
export class OrderItemResponse implements OrderItem {
  @ApiProperty({ example: 'SKU-1' })
  readonly sku!: string;

  @ApiProperty({ example: 2 })
  readonly quantity!: number;

  @ApiProperty({ description: 'Minor units (cents).', example: 1250 })
  readonly unitPriceCents!: number;
}

@ApiSchema({ name: 'Order' })
export class OrderResponse implements Order {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ example: 'c-42' })
  readonly customerId!: string;

  @ApiProperty({ description: 'Computed server-side from the items (cents).', example: 3700 })
  readonly totalCents!: number;

  @ApiProperty({ example: 'EUR' })
  readonly currency!: string;

  @ApiProperty({
    enum: ORDER_STATUSES,
    description: 'PENDING until the payment saga finishes; PAID and PAYMENT_FAILED are final.',
  })
  readonly status!: OrderStatus;

  @ApiProperty({ type: [OrderItemResponse] })
  readonly items!: OrderItemResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  readonly createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  readonly updatedAt!: Date;
}

@ApiSchema({ name: 'OrderPage' })
export class OrderPageResponse implements OrderPage {
  @ApiProperty({ type: [OrderResponse], description: 'Newest first.' })
  readonly items!: OrderResponse[];

  @ApiProperty({ example: 20 })
  readonly limit!: number;

  @ApiProperty({ example: 0 })
  readonly offset!: number;
}
