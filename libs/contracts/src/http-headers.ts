/**
 * Set by api-gateway from the verified JWT `sub`; a client-sent value is never forwarded.
 * order-service trusts it because it is reachable only through the gateway (#61).
 */
export const CUSTOMER_ID_HEADER = 'x-customer-id';
