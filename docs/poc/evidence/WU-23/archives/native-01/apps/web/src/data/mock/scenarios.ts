export const mockScenarios = {
  populated: { dataset: 'seed', delayMs: 0, failure: null },
  empty: { dataset: 'empty', delayMs: 0, failure: null },
  loading: { dataset: 'seed', delayMs: 1200, failure: null },
  error: { dataset: 'seed', delayMs: 0, failure: 'error' },
  offline: { dataset: 'seed', delayMs: 0, failure: 'offline' },
} as const;
export type MockScenarioId = keyof typeof mockScenarios;

export function waitForScenario(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
