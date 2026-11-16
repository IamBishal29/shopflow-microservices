import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import type { DownstreamResponse } from '../proxy/downstream.client';
import { REDIS } from '../redis/redis.module';

interface CachedOrder {
  readonly contentType: string | null;
  readonly bodyBase64: string;
}

export interface CachedResult {
  readonly response: DownstreamResponse;
  /** true when the answer came from Redis without calling order-service. */
  readonly hit: boolean;
}

/**
 * Cache-aside for single-order reads: look in Redis, on a miss call order-service and store
 * the answer with a short TTL. There is no invalidation: status changes happen in the saga
 * (Kafka), which the gateway does not see, so an order may read stale for up to the TTL.
 *
 * Fails open: Redis is an optimisation here, so any Redis error means "go to the source".
 */
@Injectable()
export class OrderCacheService {
  private readonly logger = new Logger(OrderCacheService.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlMs = config.get('ORDER_CACHE_TTL_SECONDS', { infer: true }) * 1000;
  }

  async getOrLoad(
    /** Whose view this is (JWT sub): one user's cached answer is never served to another. */
    scope: string,
    orderId: string,
    load: () => Promise<DownstreamResponse>,
  ): Promise<CachedResult> {
    const key = `order-cache:{${scope}}:${orderId}`;

    const cached = await this.read(key);
    if (cached) return { response: cached, hit: true };

    const response = await load();
    // Only 200s: caching a 404 would hide an order created a moment later, and 5xx are
    // transient by definition.
    if (response.status === 200) await this.write(key, response);
    return { response, hit: false };
  }

  private async read(key: string): Promise<DownstreamResponse | undefined> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as CachedOrder;
      return {
        status: 200,
        contentType: entry.contentType,
        body: Buffer.from(entry.bodyBase64, 'base64'),
      };
    } catch (error: unknown) {
      this.logger.warn(`Order cache read failed, using order-service: ${String(error)}`);
      return undefined;
    }
  }

  private async write(key: string, response: DownstreamResponse): Promise<void> {
    const entry: CachedOrder = {
      contentType: response.contentType,
      bodyBase64: response.body.toString('base64'),
    };
    try {
      await this.redis.set(key, JSON.stringify(entry), 'PX', this.ttlMs);
    } catch (error: unknown) {
      this.logger.warn(`Order cache write failed: ${String(error)}`);
    }
  }
}
