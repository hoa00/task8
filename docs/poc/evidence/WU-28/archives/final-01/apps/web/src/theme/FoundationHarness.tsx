import { FoundationSample } from '@studio/ui/foundation-sample';
import { useTheme } from './theme-context';
import type { ThemePreferences } from './preferences';
export function FoundationHarness() {
  const { preferences, effectiveDark, setPreferences } = useTheme();
  return <><FoundationSample /><div id="foundation-controls" className="fixed left-[900px] top-0 flex flex-col gap-2">
    {(Object.keys(preferences) as (keyof ThemePreferences)[]).map(key => <label key={key}>{key}<select aria-label={key} value={preferences[key]} onChange={event => setPreferences({ [key]: event.target.value } as Partial<ThemePreferences>)}>
      {{ theme: ['system', 'light', 'dark'], accent: ['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite'], side: ['comfortable', 'compact'], density: ['comfortable', 'compact'], motion: ['system', 'full', 'reduce'] }[key].map(value => <option key={value}>{value}</option>)}
    </select></label>)}<output data-effective-dark>{String(effectiveDark)}</output>
  </div></>;
}
