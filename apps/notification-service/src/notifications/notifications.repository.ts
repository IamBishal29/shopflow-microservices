import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { Channel, Notification } from './notification';

export type SendOutcome = 'sent' | 'duplicate';

/**
 * Upper bound for one send, which runs inside the transaction. A slow provider must fail
 * and be retried, not hold a row lock and a pool connection indefinitely.
 */
export const SEND_TIMEOUT_MS = 10_000;

/** Persistence for notifications. The only class in notification-service that talks to Prisma. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts the notification row, then runs `deliver`, then commits: a row exists if and
   * only if delivery succeeded.
   * - deliver throws -> the row is rolled back; the error reaches Kafka, which retries.
   * - the event was already sent -> UNIQUE(event_id) rejects the insert -> 'duplicate',
   *   deliver never runs. A concurrent duplicate waits on the index lock, then gets the same.
   * Left over (at-least-once): a crash after delivering but before COMMIT sends again.
   */
  async recordAndSend(
    notification: Notification,
    channel: Channel,
    deliver: () => Promise<void>,
  ): Promise<SendOutcome> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.notification.create({ data: { ...notification, channel } });
          await deliver();
        },
        { timeout: SEND_TIMEOUT_MS },
      );
      return 'sent';
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
