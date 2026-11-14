import { z } from 'zod';
import { orderCreatedV1Schema } from './events/order-created.v1';
import { paymentFailedV1Schema, paymentSucceededV1Schema } from './events/payment-result.v1';
import { TOPICS, Topic } from './topics';

const schemaByTopic = {
  [TOPICS.orderCreated]: orderCreatedV1Schema,
  [TOPICS.paymentSucceeded]: paymentSucceededV1Schema,
  [TOPICS.paymentFailed]: paymentFailedV1Schema,
} as const satisfies Record<Topic, z.ZodType>;

/** The typed event each topic carries, e.g. EventOf<'order.created.v1'> = OrderCreatedV1. */
export type EventOf<T extends Topic> = z.infer<(typeof schemaByTopic)[T]>;

/**
 * The message can never become valid by retrying (bad JSON or wrong shape). Consumers
 * should send it straight to the DLQ instead of retrying (#12).
 * `issues` holds paths and rule messages only, never the field values.
 */
export class ContractViolationError extends Error {
  override readonly name = 'ContractViolationError';

  constructor(
    readonly topic: Topic,
    readonly issues: readonly string[],
  ) {
    super(`Invalid ${topic} message: ${issues.join('; ')}`);
  }
}

/** Turns a raw Kafka message value into a typed event, or throws ContractViolationError. */
export function parseEvent<T extends Topic>(topic: T, value: string | null): EventOf<T> {
  if (value === null) throw new ContractViolationError(topic, ['message has no value']);

  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new ContractViolationError(topic, ['value is not valid JSON']);
  }

  const result = schemaByTopic[topic].safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ContractViolationError(topic, issues);
  }
  return result.data as EventOf<T>;
}
