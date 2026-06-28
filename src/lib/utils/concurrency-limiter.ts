// Simple promise-based concurrency limiter.
//
// The research engine runs 5 agents in parallel (Promise.allSettled), and
// each agent issues a streaming LLM call. When the upstream is a reasoning
// model (MiniMax-M3, DeepSeek-R1, o1-style) the first tokens take a long
// time to arrive because the model thinks before it streams. Firing 5 such
// streams at the exact same instant stresses the provider's gateway: some
// streams stall, drop mid-flight, or never close cleanly. The result is a
// flaky `network_error` degradation on whichever agents lose the race.
//
// Limiting how many provider calls are *in flight* at once spreads the load
// across a short window instead of a thundering herd, dramatically reducing
// mid-stream drops. This is a process-local semaphore (module-level slots),
// which is the right granularity: within a single Vercel lambda, the 5
// agents share one event loop and one outbound connection pool.
//
// Cross-instance fairness is not a goal here — different lambdas running
// different sessions each get their own limiter, and that is fine because
// the upstream rate limits are per-key, not per-lambda.

export interface ConcurrencyLimiter {
  /** Run `fn` as soon as a slot is free. Resolves/rejects with fn's result. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Current number of occupied slots (0..max). Test/diagnostic helper. */
  readonly active: number;
  /** Number of callers waiting for a slot. Test/diagnostic helper. */
  readonly waiting: number;
}

export function createConcurrencyLimiter(max: number): ConcurrencyLimiter {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  // Each waiting caller parks on its own resolver pair. When a slot frees
  // (active drops below limit) we drain as many waiters as slots allow.
  const queue: Array<() => void> = [];

  // Wake up zero or more waiters if capacity is available.
  const pump = () => {
    while (active < limit && queue.length > 0) {
      const resume = queue.shift()!;
      // The resumed caller will increment `active` itself in run(). Do not
      // increment here — run() owns the increment so a rejected fn (which
      // never reaches the finally) cannot desync the counter.
      resume();
    }
  };

  return {
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const start = () => {
          active++;
          fn()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        };
        if (active < limit) {
          // Capacity now — start immediately. pump() not needed since we
          // increment synchronously, preventing over-admission below.
          start();
        } else {
          // No capacity — park. pump() will resume us when a slot frees.
          queue.push(start);
        }
      });
    },
  };
}
