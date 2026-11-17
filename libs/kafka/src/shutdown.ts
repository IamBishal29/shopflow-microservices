/**
 * Upper bound for one shutdown step (consumers leave, relay batch, producer disconnect).
 * Three steps run one after another, so the worst case (~9 s) stays below Docker's 10 s
 * stop grace period and Kubernetes' 30 s default; a SIGKILL would cut everything off.
 * With Kafka up every step takes well under a second.
 */
export const SHUTDOWN_STEP_TIMEOUT_MS = 3_000;

export type StepOutcome =
  | { readonly status: 'done' }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'timed-out' };

/**
 * Waits for `work` at most `timeoutMs`, then gives up on it. Never throws: one failing or
 * hanging shutdown step must not skip the steps after it (e.g. closing the DB pool).
 * Abandoning is safe here because delivery is at-least-once: whatever was not committed or
 * marked published is delivered again after the restart, and consumers deduplicate.
 */
export async function settleWithin(
  work: Promise<unknown>,
  timeoutMs = SHUTDOWN_STEP_TIMEOUT_MS,
): Promise<StepOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<StepOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'timed-out' }), timeoutMs);
  });
  const settled = work.then(
    (): StepOutcome => ({ status: 'done' }),
    (error: unknown): StepOutcome => ({ status: 'failed', error }),
  );
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    clearTimeout(timer); // a finished step must not keep the event loop alive for 3 s
  }
}
