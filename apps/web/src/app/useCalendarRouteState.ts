import { useLocation, useNavigate } from '@tanstack/react-router';
import type { DateOnly } from '@studio/contracts/api';
import type { CalendarMode } from '@studio/domain';
import { useDataRuntime } from '../data/context';
import { validateRouteSearch } from './navigation';
export function useCalendarRouteState() {
  const route = useLocation(),
    navigate = useNavigate(),
    { clock } = useDataRuntime();
  const search = validateRouteSearch(route.search);
  return {
    controlledDate: search.calendarDate ?? clock.today(),
    controlledCalendarMode: search.calendarMode ?? ('month' as CalendarMode),
    onDateChange: (calendarDate: DateOnly) => {
      void navigate({ to: route.pathname, search: (previous) => ({ ...previous, calendarDate }) });
    },
    onCalendarModeChange: (calendarMode: CalendarMode) => {
      void navigate({ to: route.pathname, search: (previous) => ({ ...previous, calendarMode }) });
    },
  };
}
