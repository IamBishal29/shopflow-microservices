import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { CORRELATION_HEADER, isValidCorrelationId } from '@shopflow/errors';
import type { NextFunction, Request, Response } from 'express';

/**
 * Gives every request one ID: the caller's, if well-formed (so a client or upstream proxy
 * can trace its own call), otherwise a new UUID. Written back onto the request, so the
 * proxy forwards it and the error filter echoes it, and onto the response for the client.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[CORRELATION_HEADER];
    const id = isValidCorrelationId(incoming) ? incoming : randomUUID();
    req.headers[CORRELATION_HEADER] = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  }
}
