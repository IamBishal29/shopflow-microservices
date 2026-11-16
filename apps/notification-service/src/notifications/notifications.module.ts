import { Module } from '@nestjs/common';
import { LogNotificationSender, NOTIFICATION_SENDER } from './notification-sender';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { PaymentResultsConsumer } from './payment-results.consumer';

@Module({
  providers: [
    PaymentResultsConsumer,
    NotificationsService,
    NotificationsRepository,
    // The one line to change for a real channel (e.g. an SMTP or SMS adapter).
    { provide: NOTIFICATION_SENDER, useClass: LogNotificationSender },
  ],
})
export class NotificationsModule {}
