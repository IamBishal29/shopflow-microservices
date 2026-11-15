import { ServiceUnavailableException } from '@nestjs/common';
import { DomainError } from '@shopflow/errors';

/** A request with this key is still being processed: retry later (409). */
export class IdempotencyKeyInUseError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_IN_USE';
  readonly kind = 'conflict';
  readonly title = 'Idempotency-Key in use';

  constructor() {
    super('A request with this Idempotency-Key is still in progress. Retry shortly.');
  }
}

/** The key was used before for a different request: a client bug, never retryable (422). */
export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly kind = 'rule_violation';
  readonly title = 'Idempotency-Key reused';

  constructor() {
    super('This Idempotency-Key was already used with a different request body.');
  }
}

/** Redis is unreachable: fail closed rather than risk a duplicate order (503). */
export class IdempotencyUnavailableError extends ServiceUnavailableException {
  static readonly RETRY_AFTER_SECONDS = 5;

  constructor(cause: unknown) {
    super('Idempotency store unavailable', { cause });
  }
}
