import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { RequestWithUser } from '../auth/authenticated-user';
import { OrderCacheService } from '../cache/order-cache.service';
import { EnvironmentVariables } from '../config/env.validation';
import { requestFingerprint } from '../idempotency/fingerprint';
import { IdempotencyUnavailableError } from '../idempotency/idempotency.errors';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { withCustomerId } from './bind-customer';
import { DownstreamClient, DownstreamResponse } from './downstream.client';

/**
 * The public /orders API, forwarded to order-service. Routes are listed explicitly: the
 * gateway exposes a deliberate surface, not "everything order-service happens to serve".
 * Body and query validation stay in order-service (one owner for the rules).
 */
@Controller('orders')
export class OrdersProxyController {
  private readonly baseUrl: string;

  constructor(
    private readonly downstream: DownstreamClient,
    private readonly idempotency: IdempotencyService,
    private readonly cache: OrderCacheService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.baseUrl = config.get('ORDER_SERVICE_URL', { infer: true });
  }

  /**
   * Requires Idempotency-Key: a retried POST returns the first answer, never a 2nd order.
   * customerId always comes from the JWT `sub`, never from the client.
   */
  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    const sub = req.user?.sub;
    if (!sub) throw new UnauthorizedException(); // unreachable: the JWT guard ran first
    // Bound before fingerprinting: a retry that spoofs another customerId is still the
    // same request, and the order is always created for the caller.
    const body = withCustomerId(req.body as unknown, sub);
    try {
      const { response, replayed } = await this.idempotency.execute(
        sub,
        idempotencyKey,
        requestFingerprint('POST', '/orders', body),
        () =>
          this.downstream.send({
            baseUrl: this.baseUrl,
            method: 'POST',
            path: '/orders',
            headers: req.headers,
            body,
          }),
      );
      if (replayed) res.setHeader('Idempotent-Replayed', 'true');
      reply(res, response);
    } catch (error: unknown) {
      if (error instanceof IdempotencyUnavailableError) {
        res.setHeader('Retry-After', IdempotencyUnavailableError.RETRY_AFTER_SECONDS);
      }
      throw error;
    }
  }

  @Get()
  async list(@Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.downstream.send({
      baseUrl: this.baseUrl,
      method: 'GET',
      path: `/orders${queryString(req.originalUrl)}`,
      headers: req.headers,
    });
    reply(res, result);
  }

  /** Cache-aside in Redis (short TTL): status may lag the saga by up to the TTL. */
  @Get(':id')
  async findById(
    // Validated here so the downstream path is built only from a UUID (no `..` tricks).
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    const sub = req.user?.sub;
    if (!sub) throw new UnauthorizedException(); // unreachable: the JWT guard ran first
    const { response, hit } = await this.cache.getOrLoad(sub, id, () =>
      this.downstream.send({
        baseUrl: this.baseUrl,
        method: 'GET',
        path: `/orders/${id}`,
        headers: req.headers,
      }),
    );
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    reply(res, response);
  }
}

function queryString(originalUrl: string): string {
  const index = originalUrl.indexOf('?');
  return index === -1 ? '' : originalUrl.slice(index);
}

/** Status and body pass through unchanged; x-correlation-id was set by the middleware. */
function reply(res: Response, result: DownstreamResponse): void {
  if (result.contentType) res.setHeader('content-type', result.contentType);
  res.status(result.status).send(result.body);
}
