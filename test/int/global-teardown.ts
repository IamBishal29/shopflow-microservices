import './env'; // declares globalThis.__INT_CONTAINERS__
/** Stops the containers from global-setup (Ryuk would also reap them if the run crashes). */
export default async function globalTeardown(): Promise<void> {
  await Promise.all((globalThis.__INT_CONTAINERS__ ?? []).map((c) => c.stop()));
}
