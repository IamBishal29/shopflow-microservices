/**
 * Orders are always created for the authenticated caller: whatever `customerId` the client
 * sent is replaced by the token's `sub` (prevents BOLA/IDOR, ordering as someone else).
 *
 * Only a JSON object is rewritten. Anything else (array, string, null) passes through
 * unchanged so order-service's validation answers 400, the single owner of body rules.
 */
export function withCustomerId(body: unknown, sub: string): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  return { ...body, customerId: sub };
}
