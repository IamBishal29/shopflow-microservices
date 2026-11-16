import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { CUSTOMER_ID_HEADER } from '@shopflow/contracts';
import type { Request } from 'express';

/** Printable ASCII without spaces, as a JWT `sub` is (e.g. "c-42", "auth0|abc"). */
const VALID_CUSTOMER_ID = /^[\x21-\x7E]{1,255}$/;

/** The caller's customer id, or 401: a read without an identity must never see all orders. */
export function customerIdFrom(value: unknown): string {
  if (typeof value !== 'string' || !VALID_CUSTOMER_ID.test(value)) {
    throw new UnauthorizedException(
      `Missing or invalid ${CUSTOMER_ID_HEADER}: call order reads through the api-gateway`,
    );
  }
  return value;
}

/** Whose orders this request may read (set by the gateway from the JWT `sub`). */
export const CustomerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string =>
  customerIdFrom(ctx.switchToHttp().getRequest<Request>().headers[CUSTOMER_ID_HEADER]),
);

/** OpenAPI: documents the header that @CustomerId() reads. */
export const ApiCustomerIdHeader = (): MethodDecorator =>
  ApiHeader({
    name: CUSTOMER_ID_HEADER,
    required: true,
    description: 'Caller identity, set by api-gateway from the JWT sub. Missing: 401.',
  });
