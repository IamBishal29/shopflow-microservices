/**
 * Test double for the ioredis commands the gateway uses: SET (PX, NX), GET, DEL.
 * `eval` always fails, so the rate limiter fails open in tests that use this fake.
 * Set `down = true` to simulate an unreachable Redis.
 */
export class FakeRedis {
  down = false;
  /** Last PX (ms) passed to SET per key, so tests can assert TTLs. */
  readonly lastTtlMs = new Map<string, number>();
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  set(key: string, value: string, _px: 'PX', ttlMs: number, nx?: 'NX'): Promise<'OK' | null> {
    return this.run(() => {
      // Like Redis: "ERR invalid expire time in set" instead of storing a key that never lives.
      if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new Error('ERR invalid expire time in set');
      if (nx && this.live(key) !== undefined) return null;
      this.data.set(key, { value, expiresAt: Date.now() + ttlMs });
      this.lastTtlMs.set(key, ttlMs);
      return 'OK';
    });
  }

  get(key: string): Promise<string | null> {
    return this.run(() => this.live(key) ?? null);
  }

  del(key: string): Promise<number> {
    return this.run(() => (this.data.delete(key) ? 1 : 0));
  }

  eval(): Promise<never> {
    return Promise.reject(new Error('FakeRedis: eval not supported'));
  }

  disconnect(): void {}

  private live(key: string): string | undefined {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.data.delete(key);
    return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
  }

  private run<T>(command: () => T): Promise<T> {
    return this.down
      ? Promise.reject(new Error("Stream isn't writeable and enableOfflineQueue options is false"))
      : Promise.resolve(command());
  }
}
