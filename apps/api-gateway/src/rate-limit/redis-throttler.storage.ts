import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

interface ThrottlerStorageRecord {
  readonly totalHits: number;
  readonly timeToExpire: number;
  readonly isBlocked: boolean;
  readonly timeToBlockExpire: number;
}

/**
 * Fixed window + block, in one atomic step (Redis runs a script without interleaving).
 * KEYS[1] = hit counter, KEYS[2] = block flag; ARGV = window ms, limit, block ms.
 * Returns { hits, window ms left, blocked 0|1, block ms left }.
 */
const HIT_SCRIPT = `
local blockMs = redis.call('PTTL', KEYS[2])
if blockMs > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or 0), redis.call('PTTL', KEYS[1]), 1, blockMs }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local windowMs = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, windowMs, 1, tonumber(ARGV[3]) }
end
return { hits, windowMs, 0, 0 }
`;

/** Throttler counters shared by every gateway replica, so the limit is global, not per pod. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  /** ttl and blockDuration arrive in ms; the record answers in whole seconds (Retry-After). */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // {hash tag}: both keys land in the same Redis Cluster slot, as multi-key scripts require.
    const base = `ratelimit:${throttlerName}:{${key}}`;
    try {
      const reply = await this.redis.eval(
        HIT_SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        blockDuration,
      );
      const [hits, windowMs, blocked, blockMs] = toNumbers(reply);
      return {
        totalHits: hits,
        timeToExpire: toSeconds(windowMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockMs),
      };
    } catch (error: unknown) {
      // Fail open (Syed's decision): a Redis outage must not become an API outage.
      // JWT auth still applies; only the request budget is unenforced meanwhile.
      this.logger.warn(`Rate limit not enforced, Redis error: ${String(error)}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}

function toNumbers(reply: unknown): [number, number, number, number] {
  if (!Array.isArray(reply) || reply.length !== 4 || !reply.every((n) => typeof n === 'number')) {
    throw new Error(`unexpected rate-limit script reply: ${JSON.stringify(reply)}`);
  }
  return reply as [number, number, number, number];
}

function toSeconds(ms: number): number {
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}
