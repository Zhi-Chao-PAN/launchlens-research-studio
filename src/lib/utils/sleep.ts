// Abortable promise-based delay. Resolves after `ms` milliseconds; rejects with
// a DOMException("AbortError") if the signal aborts before the timer fires.
// If the signal is already aborted when called, rejects immediately on the next
// microtask so callers get uniform abort semantics.
export interface SleepOptions {
  signal?: AbortSignal | null;
}

export function sleep(ms: number, optsOrSignal?: SleepOptions | AbortSignal | null): Promise<void> {
  const signal = optsOrSignal instanceof AbortSignal
    ? optsOrSignal
    : optsOrSignal?.signal ?? undefined;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      // Defer to microtask to keep the function consistently async even when
      // already aborted — matches setTimeout(…,0) behaviour on the non-abort path.
      queueMicrotask(() => reject(new DOMException("The operation was aborted.", "AbortError")));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
