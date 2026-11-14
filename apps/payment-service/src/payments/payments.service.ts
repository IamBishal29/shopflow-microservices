import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderCreatedV1 } from '@shopflow/contracts';
import { EnvironmentVariables } from '../config/env.validation';
import { decideCharge, Payment } from './payment';
import { paymentResultEvent } from './payment-events';
import { PaymentsRepository } from './payments.repository';

/** Step 2 of the choreography saga: react to a new order with a payment result. */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly declineAboveCents: number;

  constructor(
    private readonly payments: PaymentsRepository,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.declineAboveCents = config.get('PAYMENT_DECLINE_ABOVE_CENTS', { infer: true });
  }

  /** Returns the recorded payment, or null if this event (or order) was already handled. */
  async handleOrderCreated(event: OrderCreatedV1): Promise<Payment | null> {
    const { orderId, totalCents, currency } = event.payload;
    const decision = decideCharge(totalCents, this.declineAboveCents);

    const payment = await this.payments.record(
      event.eventId,
      { orderId, amountCents: totalCents, currency, ...decision },
      (recorded) => paymentResultEvent(recorded, event.correlationId),
    );

    if (payment === null) {
      this.logger.log(`Duplicate event ${event.eventId} for order ${orderId} skipped`);
    } else {
      this.logger.log(`Order ${orderId} payment ${payment.status}`);
    }
    return payment;
  }
}
