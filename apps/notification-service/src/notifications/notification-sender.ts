import { Injectable, Logger } from '@nestjs/common';
import type { Channel, Notification } from './notification';

/**
 * Port: how a notification leaves the service. The service depends on this interface, not
 * on a provider; email or SMS is a new adapter bound to NOTIFICATION_SENDER, nothing else.
 */
export interface NotificationSender {
  /** Stored with each notification (notifications.channel). */
  readonly channel: Channel;
  /** Resolve only once delivered; throw to have the event retried. */
  send(notification: Notification): Promise<void>;
}

/** Nest has no runtime interfaces, so the port is injected by this token. */
export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

/** Adapter for local development: "sends" by writing a log line. */
@Injectable()
export class LogNotificationSender implements NotificationSender {
  readonly channel = 'log' as const;
  private readonly logger = new Logger('Notification');

  send(notification: Notification): Promise<void> {
    this.logger.log(
      `To customer of order ${notification.orderId}: ${notification.message} ` +
        `[event ${notification.eventId}, correlation ${notification.correlationId}]`,
    );
    return Promise.resolve();
  }
}
