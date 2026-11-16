import { BadGatewayException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CUSTOMER_ID_HEADER } from '@shopflow/contracts';
import { CORRELATION_HEADER } from '@shopflow/errors';
import type { IncomingHttpHeaders } from 'node:http';
import { EnvironmentVariables } from '../config/env.validation';

/**
 * Request headers the gateway passes on. Everything else (Host, cookies, hop-by-hop) stays
 * here. idempotency-key: order-service enforces it too, so a retry after a gateway 504
 * cannot create a second order (#56).
 */
const FORWARDED_HEADERS = [
  'accept',
  'content-type',
  CORRELATION_HEADER,
  'idempotency-key',
] as const;

export interface DownstreamRequest {
  readonly baseUrl: string;
  readonly method: 'GET' | 'POST';
  /** Path plus optional query string, built by the caller from validated parts. */
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  /**
   * The verified JWT `sub`, sent as x-customer-id: order-service scopes reads to it (#61).
   * Never taken from client headers (not in the allowlist), so it cannot be spoofed.
   */
  readonly customerId: string;
  /** Already-parsed JSON body (Express body parser), re-serialised for the downstream. */
  readonly body?: unknown;
}

export interface DownstreamResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: Buffer;
}

/**
 * One outbound HTTP call with a hard deadline. Downstream statuses (incl. 4xx/5xx problem
 * bodies) are returned as-is; only transport failures become gateway errors.
 */
@Injectable()
export class DownstreamClient {
  private readonly timeoutMs: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.timeoutMs = config.get('DOWNSTREAM_TIMEOUT_MS', { infer: true });
  }

  async send(request: DownstreamRequest): Promise<DownstreamResponse> {
    const url = `${request.baseUrl}${request.path}`;
    const hasBody = request.method !== 'GET' && request.body !== undefined;
    const deadline = AbortSignal.timeout(this.timeoutMs);
    try {
      // The signal covers connecting, headers AND reading the body: a downstream that
      // trickles bytes forever still ends at the deadline.
      const response = await fetch(url, {
        method: request.method,
        headers: {
          ...forwardedHeaders(request.headers),
          [CUSTOMER_ID_HEADER]: request.customerId,
        },
        body: hasBody ? JSON.stringify(request.body) : undefined,
        signal: deadline,
      });
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: Buffer.from(await response.arrayBuffer()),
      };
    } catch (error: unknown) {
      // Ask the signal, not the error: the rejection's shape (DOMException, wrapped
      // TypeError) varies by runtime, but "did our deadline fire?" does not.
      if (deadline.aborted) {
        throw new GatewayTimeoutException(
          `${request.method} ${url} exceeded ${this.timeoutMs} ms`,
          { cause: error },
        );
      }
      // fetch rejects with TypeError('fetch failed') for refused/reset/DNS errors.
      throw new BadGatewayException(`${request.method} ${url} failed`, { cause: error });
    }
  }
}

function forwardedHeaders(incoming: IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = incoming[name];
    if (typeof value === 'string') headers[name] = value;
  }
  return headers;
}
