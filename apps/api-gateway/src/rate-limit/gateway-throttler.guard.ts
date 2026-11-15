import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../auth/authenticated-user';

/**
 * Counts requests per caller: the verified JWT subject when there is one (users behind one
 * NAT/office IP get separate budgets), otherwise the client IP (public routes).
 * Runs after JwtAuthGuard (registered later), so `req.user` is already verified.
 */
@Injectable()
export class GatewayThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const { user } = req as Pick<RequestWithUser, 'user'>;
    return user ? `user:${user.sub}` : `ip:${await super.getTracker(req)}`;
  }

  /** One budget per caller across all routes (the default key is per controller method). */
  protected override generateKey(
    _context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ): string {
    return `${throttlerName}:${tracker}`;
  }
}
