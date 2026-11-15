import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { IS_PUBLIC } from './public.decorator';

/**
 * Global guard: every route needs a valid bearer token unless marked @Public().
 * JwtService verifies signature, algorithm (HS256 only), exp, iss and aud
 * (options in AuthModule). Stateless: no session store, no call to another service.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const token = bearerToken(http.getRequest<Request>());
    try {
      if (!token) throw new Error('missing bearer token');
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(token);
      // A correctly signed token must still say who the caller is.
      if (typeof claims.sub !== 'string' || claims.sub === '') throw new Error('no subject');
      return true;
    } catch {
      // RFC 6750: tell the client which scheme to use. The body stays generic: whether the
      // token was expired, forged or malformed is a hint for attackers, not for clients.
      http
        .getResponse<Response>()
        .setHeader('WWW-Authenticate', token ? 'Bearer error="invalid_token"' : 'Bearer');
      throw new UnauthorizedException('A valid bearer token is required.');
    }
  }
}

function bearerToken(req: Request): string | undefined {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
