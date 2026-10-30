import type { QueryClient } from '@tanstack/react-query';
import { Ict24hSessionSchema } from '@studio/contracts/api';
import type {
  AuthLoginInput,
  CapabilitiesDto,
  Ict24hSessionDto,
  OperationOutput,
} from '@studio/contracts/api';
import type { RequestIntent, StudioClient } from './operations.ts';
import { queryKeys } from './query-keys.ts';
import { StudioApiError, StudioTransportError } from './errors.ts';

export interface AuthSnapshot extends RequestIntent {
  accessExpiresAt: string | undefined;
  identityMode: CapabilitiesDto['identityMode'] | undefined;
  signal: AbortSignal;
}
export type AuthEvent = 'signed-in' | 'signed-out' | 'session-changed' | 'unavailable';
export interface AuthFacade {
  readonly generation: number;
  connect(cache: QueryClient): void;
  expectedSessionId(): string | undefined;
  snapshot(): AuthSnapshot;
  beforeMutation(): Promise<void>;
  changed(expectedGeneration: number): Promise<void>;
  observeSession(value: OperationOutput<'getSession'>): Promise<void>;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  start(): () => void;
  login(input: AuthLoginInput): Promise<Ict24hSessionDto>;
  refresh(): Promise<Ict24hSessionDto>;
  logout(): Promise<void>;
  check(): Promise<OperationOutput<'getSession'>>;
}
const sessionChanged = () =>
  new StudioApiError({
    error: {
      code: 'SESSION_CHANGED',
      message: 'The browser session has changed. Please try again.',
    },
  });
export function createHttpAuth(client: StudioClient): AuthFacade {
  let cache: QueryClient | undefined;
  let generation = 0,
    controller = new AbortController();
  let refreshing: Promise<Ict24hSessionDto> | undefined;
  let intentPending = false,
    channel: BroadcastChannel | undefined;
  const listeners = new Set<(event: AuthEvent) => void>();
  const current = () => cache?.getQueryData<OperationOutput<'getSession'>>(queryKeys.session());
  const expectedSessionId = () => current()?.data.authSession?.id;
  const notify = (event: AuthEvent) => {
    for (const listener of listeners) listener(event);
  };
  async function advance(clear: boolean) {
    const next = ++generation;
    controller.abort(sessionChanged());
    controller = new AbortController();
    refreshing = undefined;
    await cache?.cancelQueries();
    if (clear) cache?.clear();
    return next;
  }
  const assertGeneration = (expected: number) => {
    if (expected !== generation) throw sessionChanged();
  };
  const announce = () => channel?.postMessage({ type: 'session-changed' });
  async function resync() {
    const before = generation,
      previous = expectedSessionId();
    try {
      const result = await facade.check();
      if (generation === before && previous !== result.data.authSession?.id) {
        await advance(true);
        cache?.setQueryData(queryKeys.session(), result);
        notify('session-changed');
      }
    } catch (error) {
      if (error instanceof StudioApiError && error.status === 401) {
        await advance(true);
        notify('signed-out');
      } else if (!(error instanceof StudioApiError && error.detail.code === 'SESSION_CHANGED'))
        notify('unavailable');
    }
  }
  const facade: AuthFacade = {
    get generation() {
      return generation;
    },
    connect(value) {
      cache = value;
    },
    expectedSessionId,
    snapshot() {
      const session = current()?.data;
      return {
        generation,
        sessionId: session?.authSession?.id,
        accessExpiresAt: session?.authSession?.accessExpiresAt,
        identityMode: session?.capabilities.identityMode,
        signal: controller.signal,
      };
    },
    async beforeMutation() {
      if (intentPending) throw sessionChanged();
      const session = current()?.data;
      if (!session)
        throw new StudioApiError({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Please sign in before continuing.',
          },
        });
      if (
        session.authSession &&
        Date.parse(session.authSession.accessExpiresAt) <= Date.now() + 5000
      )
        await facade.refresh();
    },
    async changed(expected) {
      if (expected !== generation) return;
      await advance(true);
      notify('session-changed');
      announce();
      void resync();
    },
    async observeSession(value) {
      const previous = current();
      const oldId = previous?.data.authSession?.id,
        newId = value.data.authSession?.id;
      if (previous && (oldId !== newId || previous.data.user.id !== value.data.user.id)) {
        await advance(true);
        cache?.setQueryData(queryKeys.session(), value);
        notify('session-changed');
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (typeof window === 'undefined') return () => {};
      const focus = () => {
        if (!intentPending && document.visibilityState === 'visible') void resync();
      };
      window.addEventListener('focus', focus);
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('task8-auth-v1');
        channel.onmessage = (event: MessageEvent<unknown>) => {
          if (
            event.data &&
            typeof event.data === 'object' &&
            'type' in event.data &&
            event.data.type === 'session-changed'
          )
            void resync();
        };
      }
      return () => {
        window.removeEventListener('focus', focus);
        channel?.close();
        channel = undefined;
      };
    },
    async login(input) {
      if (intentPending) throw sessionChanged();
      intentPending = true;
      const attempt = await advance(false);
      try {
        assertGeneration(attempt);
        const result = await client.execute('authLogin', { body: input });
        assertGeneration(attempt);
        await cache?.cancelQueries();
        cache?.clear();
        cache?.setQueryData(queryKeys.session(), result);
        const fresh = await client.execute('getSession', {});
        assertGeneration(attempt);
        const session = Ict24hSessionSchema.parse(fresh.data);
        cache?.setQueryData(queryKeys.session(), { data: session });
        notify('signed-in');
        announce();
        return session;
      } finally {
        intentPending = false;
      }
    },
    async refresh() {
      if (refreshing) return refreshing;
      const attempt = generation;
      const work = (async () => {
        const result = await client.execute('authRefresh', {});
        assertGeneration(attempt);
        cache?.setQueryData(queryKeys.session(), result);
        return result.data;
      })().catch((error) => {
        if (error instanceof StudioTransportError)
          throw new StudioApiError({
            error: {
              code: 'AUTH_SERVICE_UNAVAILABLE',
              message: 'Sign-in is temporarily unavailable. Please try again.',
            },
          });
        throw error;
      });
      refreshing = work;
      try {
        return await work;
      } finally {
        if (refreshing === work) refreshing = undefined;
      }
    },
    async logout() {
      if (intentPending) throw sessionChanged();
      intentPending = true;
      const attempt = await advance(false);
      try {
        assertGeneration(attempt);
        await client.execute('authLogout', {});
        assertGeneration(attempt);
        await cache?.cancelQueries();
        cache?.clear();
        notify('signed-out');
        announce();
      } finally {
        intentPending = false;
      }
    },
    async check() {
      const result = await client.execute('getSession', {});
      cache?.setQueryData(queryKeys.session(), result);
      const workspaces = await client.execute('listWorkspaces', {});
      cache?.setQueryData(queryKeys.workspaces(), workspaces);
      return result;
    },
  };
  return facade;
}
