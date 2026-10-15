import { AppServicesContext } from './app-services';
import type { AppServices } from './app-services';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastViewport } from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useDataRuntime } from '../../data/context';
import { captureIntent } from '../../data/operations';
import { invalidateOperation } from '../../data/invalidation';
import { translate as t } from '../../i18n/i18n';
export function AppServicesProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const { client } = useDataRuntime(),
    cache = useQueryClient();
  const [toasts, setToasts] = useState<ToastMessage[]>([]),
    [revision, setRevision] = useState(0);
  const surfaceOpened = useCallback(() => setRevision((value) => value + 1), []);
  const notice: AppServices['notice'] = (message, undo, options) => {
    const intent = captureIntent(client);
    const runUndo = async () => {
      const input = { workspaceId, undoId: undo!.id, body: {} };
      try {
        await intent.execute('undoCommand', input);
        await invalidateOperation(cache, 'undoCommand', input);
      } catch (error) {
        notice(
          error instanceof Error ? t(error.message) : t('Undo could not be applied'),
          undefined,
          {
            kind: 'error',
          },
        );
      }
    };
    setToasts((rows) => [
      {
        id: crypto.randomUUID(),
        message,
        duration: undo ? 5000 : 2200,
        ...(undo
          ? {
              action: {
                label: t('Undo'),
                onAction: () => {
                  void runUndo();
                },
              },
            }
          : {}),
        ...options,
      },
      ...rows,
    ]);
  };
  return (
    <AppServicesContext value={{ surfaceRevision: String(revision), surfaceOpened, notice }}>
      {children}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))}
      />
    </AppServicesContext>
  );
}
