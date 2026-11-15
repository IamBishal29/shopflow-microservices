import { DomainError } from './domain-error';

/** Test-only domain errors: the lib must not import any app's errors. */
export class ItemNotFoundError extends DomainError {
  readonly code = 'ITEM_NOT_FOUND';
  readonly kind = 'not_found';
  readonly title = 'Item not found';

  constructor(id: string) {
    super(`Item ${id} not found`);
  }
}

export class LimitExceededError extends DomainError {
  readonly code = 'LIMIT_EXCEEDED';
  readonly kind = 'rule_violation';
  readonly title = 'Limit exceeded';

  constructor(limit: number) {
    super(`Value exceeds the limit of ${limit}`);
  }
}
