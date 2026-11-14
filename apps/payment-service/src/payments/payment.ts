/** Domain types for payments. Services depend on these, never on Prisma's generated types. */
export type ChargeDecision =
  { readonly status: 'SUCCEEDED' } | { readonly status: 'FAILED'; readonly reason: string };

export type NewPayment = {
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: string;
} & ChargeDecision;

export type Payment = NewPayment & {
  readonly id: string;
  readonly createdAt: Date;
};

/**
 * Simulated charge. Deterministic so demos and tests can force either outcome; there is
 * no real payment provider and no card data anywhere in ShopFlow.
 */
export function decideCharge(amountCents: number, declineAboveCents: number): ChargeDecision {
  return amountCents > declineAboveCents
    ? { status: 'FAILED', reason: 'amount_over_limit' }
    : { status: 'SUCCEEDED' };
}
