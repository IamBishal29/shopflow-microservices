import { DomainError } from '../common/errors/domain-error';

export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND';
  readonly kind = 'not_found';
  readonly title = 'Order not found';

  constructor(orderId: string) {
    super(`Order ${orderId} not found`);
  }
}

export class OrderTotalTooLargeError extends DomainError {
  readonly code = 'ORDER_TOTAL_TOO_LARGE';
  readonly kind = 'rule_violation';
  readonly title = 'Order total too large';

  constructor(maxTotalCents: number) {
    super(`Order total exceeds the maximum of ${maxTotalCents} minor units`);
  }
}
