import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';
import type { DownstreamResponse } from '../proxy/downstream.client';
import { REDIS } from '../redis/redis.module';
import {
  IdempotencyKeyInUseError,
  IdempotencyKeyReusedError,
  IdempotencyUnavailableError,
} from './idempotency.errors';

/** Client-chosen, unique per logical operation; a UUID v4 is the usual choice. */
const VALID_KEY = /^[A-Za-z0-9._:-]{1,255}$/;
/** The in-progress lock outlives the slowest downstream call by this much. */
const LOCK_MARGIN_MS = 5_000;

type IdempotencyRecord =
  | { readonly state: 'in_progress'; readonly fingerprint: string }
  | {
      readonly state: 'completed';
      readonly fingerprint: string;
      readonly status: number;
      readonly contentType: string | null;
      readonly bodyBase64: string;
    };

export interface IdempotentResult {
  readonly response: DownstreamResponse;
  /** true when the stored response of an earlier request was returned. */
  readonly replayed: boolean;
}

/**
 * Stripe-style idempotency keys, stored in Redis:
 * first request: SET NX "in_progress" lock -> run -> store final response (TTL, default 24 h).
 * repeat: same fingerprint -> stored response; still running -> 409; other body -> 422.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly lockMs: number;
  private readonly ttlMs: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.lockMs = config.get('DOWNSTREAM_TIMEOUT_MS', { infer: true }) + LOCK_MARGIN_MS;
    this.ttlMs = config.get('IDEMPOTENCY_TTL_SECONDS', { infer: true }) * 1000;
  }

  async execute(
    /** Whose key this is (JWT sub): one user can never replay another user's response. */
    scope: string,
    key: string | undefined,
    fingerprint: string,
    action: () => Promise<DownstreamResponse>,
  ): Promise<IdempotentResult> {
    if (!key || !VALID_KEY.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key header is required: a unique value per order attempt, e.g. a UUID.',
      );
    }
    const redisKey = `idempotency:{${scope}}:${key}`;

    const lock: IdempotencyRecord = { state: 'in_progress', fingerprint };
    const acquired = await this.store(() =>
      this.redis.set(redisKey, JSON.stringify(lock), 'PX', this.lockMs, 'NX'),
    );
    if (acquired !== 'OK') {
      return { response: await this.previous(redisKey, fingerprint), replayed: true };
    }

    let response: DownstreamResponse;
    try {
      response = await action();
    } catch (error: unknown) {
      // 502/504: outcome unknown or failed. Free the key so the client can retry.
      // Known gap: after a 504 the order may exist downstream (follow-up issue).
      await this.release(redisKey);
      throw error;
    }

    if (response.status >= 500) {
      await this.release(redisKey); // transient server error: retrying is allowed
    } else {
      await this.complete(redisKey, fingerprint, response); // 2xx/4xx are final answers
    }
    return { response, replayed: false };
  }

  /** The key is taken: replay, or explain why not. */
  private async previous(redisKey: string, fingerprint: string): Promise<DownstreamResponse> {
    const raw = await this.store(() => this.redis.get(redisKey));
    // null: the lock expired between our SET and GET; treat as busy, the client retries.
    const record = raw ? (JSON.parse(raw) as IdempotencyRecord) : undefined;
    if (record && record.fingerprint !== fingerprint) throw new IdempotencyKeyReusedError();
    if (record?.state !== 'completed') throw new IdempotencyKeyInUseError();
    return {
      status: record.status,
      contentType: record.contentType,
      body: Buffer.from(record.bodyBase64, 'base64'),
    };
  }

  private async complete(
    redisKey: string,
    fingerprint: string,
    response: DownstreamResponse,
  ): Promise<void> {
    const record: IdempotencyRecord = {
      state: 'completed',
      fingerprint,
      status: response.status,
      contentType: response.contentType,
      bodyBase64: response.body.toString('base64'),
    };
    try {
      await this.redis.set(redisKey, JSON.stringify(record), 'PX', this.ttlMs);
    } catch (error: unknown) {
      // The order exists; only the replay copy is lost. The lock expires after lockMs,
      // after which a retry with this key would be forwarded again.
      this.logger.error(`Could not store idempotent response for ${redisKey}`, String(error));
    }
  }

  private async release(redisKey: string): Promise<void> {
    try {
      await this.redis.del(redisKey);
    } catch {
      // The lock expires on its own after lockMs.
    }
  }

  /** Any Redis failure before forwarding = fail closed (Syed's decision): 503, no order. */
  private async store<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch (error: unknown) {
      throw new IdempotencyUnavailableError(error);
    }
  }
}
