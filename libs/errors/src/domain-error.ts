/**
 * Transport-agnostic category of a business failure. The HTTP filter maps it to a status
 * code; a Kafka handler (M2) can map the same error to "ack and log" instead.
 */
export type DomainErrorKind = 'not_found' | 'conflict' | 'rule_violation';

/**
 * Base class for errors the domain raises on purpose. Services throw these instead of
 * Nest HTTP exceptions, so business logic does not depend on HTTP.
 */
export abstract class DomainError extends Error {
  /** Stable machine-readable code, e.g. ORDER_NOT_FOUND. Clients may switch on it. */
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;
  /** Short, human-readable summary that is the same for every occurrence. */
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
