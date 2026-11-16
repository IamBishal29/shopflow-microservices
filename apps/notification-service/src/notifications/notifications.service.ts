import { Inject, Injectable, Logger } from '@nestjs/common';
import { notificationFor, PaymentResultEvent } from './notification';
import { NOTIFICATION_SENDER, type NotificationSender } from './notification-sender';
import { NotificationsRepository, SendOutcome } from './notifications.repository';

/** Tells the customer about a payment result, at most once per event (best effort). */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
  ) {}

  async handlePaymentResult(event: PaymentResultEvent): Promise<SendOutcome> {
    const notification = notificationFor(event);
    const outcome = await this.notifications.recordAndSend(notification, this.sender.channel, () =>
      this.sender.send(notification),
    );
    if (outcome === 'duplicate') {
      this.logger.log(`Duplicate ${event.type} ${event.eventId}: already notified, skipped`);
    }
    return outcome;
  }
}
