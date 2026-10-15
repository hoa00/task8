import { operations } from '../../packages/contracts/src/operations.ts';

// Canonical request matching shared by current People/Teams HTTP browser suites.
export function decodeOperation(request) {
  const url = new URL(request.url());
  for (const [id, operation] of Object.entries(operations)) {
    if (operation.method !== request.method()) continue;
    const keys = [...operation.path.matchAll(/\{(\w+)\}/g)].map((row) => row[1]);
    const match = url.pathname.match(
      new RegExp(`^${operation.path.replace(/\{\w+\}/g, '([^/]+)')}$`),
    );
    if (!match) continue;
    const input = Object.fromEntries(
      keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]),
    );
    if (url.search)
      input.query = Object.fromEntries(
        [...url.searchParams].map(([key, value]) => [
          key,
          key === 'limit'
            ? Number(value)
            : ['archived', 'unreadOnly', 'favoriteOnly'].includes(key)
              ? value === 'true'
              : key === 'filters'
                ? JSON.parse(value)
                : value,
        ]),
      );
    if (request.postData()) input.body = request.postDataJSON();
    return { id, input };
  }
  throw Error(`Unknown contract operation ${request.method()} ${url.pathname}`);
}
