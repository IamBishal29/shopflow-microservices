import { createHash } from 'node:crypto';

/**
 * Identifies "the same request": method, path and body. Keys of JSON objects are sorted,
 * so {"a":1,"b":2} and {"b":2,"a":1} match; any changed value does not.
 */
export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method} ${path}\n${canonicalJson(body)}`)
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
