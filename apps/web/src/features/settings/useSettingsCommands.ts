import { translate as t } from '../../i18n/i18n.ts';
import { translateErrorMessage } from '../../i18n/error-message.ts';
import { setLanguage } from '../../i18n/i18n.ts';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OperationInput, OperationOutput } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { invalidateOperation } from '../../data/invalidation';
import { operationQueryKey, queryKeys } from '../../data/query-keys';
import { useTheme } from '../../theme/theme-context';
import { StudioApiError } from '../../data/errors';
type SettingsWrite =
  | 'updateWorkspace'
  | 'updateProfile'
  | 'updatePreferences'
  | 'updateNotificationPreferences';
export function useSettingsCommands() {
  const { client } = useDataRuntime(),
    cache = useQueryClient(),
    theme = useTheme(),
    held = useRef(false),
    active = useRef(true);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run<K extends SettingsWrite>(
    id: K,
    input: OperationInput<K>,
  ): Promise<OperationOutput<K> | null> {
    if (held.current) return null;
    held.current = true;
    setPending(true);
    setError('');
    try {
      const result = await client.execute(id, input);
      if (id === 'updatePreferences') {
        const preferences = (result as OperationOutput<'updatePreferences'>).data;
        cache.setQueryData(
          operationQueryKey('getPreferences', {
            workspaceId: (input as OperationInput<'updatePreferences'>).workspaceId,
          }),
          { data: preferences },
        );
        const { theme: selectedTheme, accent, side, density, motion } = preferences;
        if (active.current) {
          theme.setPreferences({ theme: selectedTheme, accent, side, density, motion });
          await setLanguage(preferences.lang);
        }
      } else if (id === 'updateProfile') cache.setQueryData(queryKeys.profile(), result);
      await invalidateOperation(cache, id, input);
      return result;
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? translateErrorMessage(cause.message)
            : t('Settings could not be saved'),
        );
      if (cause instanceof StudioApiError && cause.detail.code === 'CONFLICT')
        await invalidateOperation(cache, id, input);
      return null;
    } finally {
      held.current = false;
      if (active.current) setPending(false);
    }
  }
  return { run, pending, error, isPending: () => held.current, clearError: () => setError('') };
}
