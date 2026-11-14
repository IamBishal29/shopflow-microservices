import { Injectable } from '@nestjs/common';
import type { EventEnvelope, Topic } from '@shopflow/contracts';
import { claimEvent } from '@shopflow/database';
import { Prisma, type Payment as PaymentRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NewPayment, Payment } from './payment';

type OutboxEvent = EventEnvelope<Topic, unknown>;

/** Name under which this handler records processed events (one service may have many). */
export const CONSUMER = 'payment-service.order-created';

/** Persistence for payments. The only class in payment-service that talks to Prisma. */
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One transaction: mark `sourceEventId` processed, insert the payment and its result event
   * (outbox). Returns null when the event was already processed (idempotent consumer), or
   * when the order already has a payment (unique order_id, a second line of defense).
   * Either way nothing is charged twice and the caller can commit the Kafka offset.
   */
  async record(
    sourceEventId: string,
    payment: NewPayment,
    toEvent: (recorded: Payment) => OutboxEvent,
  ): Promise<Payment | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await claimEvent(tx, sourceEventId, CONSUMER))) return null;
        const row = await tx.payment.create({
          data: {
            orderId: payment.orderId,
            amountCents: payment.amountCents,
            currency: payment.currency,
            status: payment.status,
            reason: payment.status === 'FAILED' ? payment.reason : null,
          },
        });
        const recorded = toPayment(row);
        const event = toEvent(recorded);
        await tx.outboxEvent.create({
          data: {
            id: event.eventId,
            aggregateId: recorded.orderId,
            type: event.type,
            // Envelope is plain JSON data (strings, numbers), stored as-is.
            payload: event as unknown as Prisma.InputJsonObject,
          },
        });
        return recorded;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toPayment(row: PaymentRow): Payment {
  const base = {
    id: row.id,
    orderId: row.orderId,
    amountCents: row.amountCents,
    currency: row.currency,
    createdAt: row.createdAt,
  };
  // The CHECK constraint guarantees reason is set exactly when the payment failed.
  return row.status === 'FAILED'
    ? { ...base, status: 'FAILED', reason: row.reason ?? 'unknown' }
    : { ...base, status: 'SUCCEEDED' };
}
