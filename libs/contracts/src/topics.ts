/**
 * Kafka topic names. The version is part of the name: a breaking change gets a new topic
 * (`order.created.v2`) and both run side by side while consumers migrate.
 */
export const TOPICS = {
  orderCreated: 'order.created.v1',
  paymentSucceeded: 'payment.succeeded.v1',
  paymentFailed: 'payment.failed.v1',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** Dead-letter topic for messages a consumer gave up on (#12). */
export function dlqTopic<T extends Topic>(topic: T): `${T}.dlq` {
  return `${topic}.dlq`;
}
