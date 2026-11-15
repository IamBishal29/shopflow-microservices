import type { Request } from 'express';

/** Identity the JWT guard attaches after verifying a token. Never read from raw headers. */
export interface AuthenticatedUser {
  readonly sub: string;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };
