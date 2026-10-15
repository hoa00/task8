import { chromium } from '@playwright/test';
import { startBrowserServer } from './browser-server.mjs';
import { newPage } from '../visual/reference/environment.mjs';

// One owner for owned servers, browser, deadline and process cancellation. Assertions stay in suites.
export async function withBrowserSession(
  {
    servers = [{}],
    timeoutMs = 180000,
    signal,
    launch = () => chromium.launch({ headless: true }),
  } = {},
  run,
) {
  const owned = [];
  let browser, timer, abort;
  const cancelled = new Promise((_, reject) => {
    abort = (reason) => reject(reason instanceof Error ? reason : Error('Browser run cancelled'));
  });
  // Startup can fail before the cancellation promise is raced.
  cancelled.catch(() => {});
  const onAbort = () => abort(signal?.reason);
  const onSignal = () => abort(Error('Browser run cancelled by process signal'));
  signal?.addEventListener('abort', onAbort, { once: true });
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    signal?.throwIfAborted();
    for (const options of servers) owned.push(await startBrowserServer(options));
    browser = await launch();
    signal?.throwIfAborted();
    timer = setTimeout(() => abort(Error('Browser run timed out')), timeoutMs);
    return await Promise.race([
      run({
        browser,
        servers: owned,
        newPage: (scenario = {}, origin = owned[0].origin) =>
          newPage(browser, scenario, undefined, true, origin),
      }),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    try {
      await browser?.close();
    } finally {
      await Promise.all(owned.map((server) => server.stop()));
    }
  }
}
