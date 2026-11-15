import { Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { EnvironmentVariables } from '../config/env.validation';
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
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.baseUrl = config.get('ORDER_SERVICE_URL', { infer: true });
  }

  @Post()
  async create(@Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.downstream.send({
      baseUrl: this.baseUrl,
      method: 'POST',
      path: '/orders',
      headers: req.headers,
      body: req.body as unknown,
    });
    reply(res, result);
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

  @Get(':id')
  async findById(
    // Validated here so the downstream path is built only from a UUID (no `..` tricks).
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.downstream.send({
      baseUrl: this.baseUrl,
      method: 'GET',
      path: `/orders/${id}`,
      headers: req.headers,
    });
    reply(res, result);
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
