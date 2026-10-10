/* Verification surface only: no screen composition or future primitive implementation. */
import { Icon, Logo, PriorityIcon, TaskStatusIcon } from './icons';
import type { PriorityGlyph, StatusGlyph } from './icons';
import { iconPaths } from './icon-paths';
import type { IconName } from './icon-paths';
const typeSamples = [
  ['2xs', 'text-2xs'], ['xs', 'text-xs'], ['sm', 'text-sm'], ['body', 'text-body'],
  ['md', 'text-md'], ['lg', 'text-lg'], ['xl', 'text-xl'], ['2xl', 'text-2xl'],
] as const;
export function FoundationSample() {
  return <section id="foundation-sample" className="flex w-[760px] flex-col gap-4 bg-canvas p-6 text-foreground">
    <Logo />
    <div data-sample="surfaces" className="flex gap-2">
      {['bg-sidebar', 'bg-surface', 'bg-surface-2', 'bg-surface-3', 'bg-sunken', 'bg-accent', 'bg-accent-soft', 'bg-green', 'bg-amber', 'bg-red'].map((className, index) => <div key={className} data-swatch={index} className={`h-8 w-8 rounded-xs border border-solid border-border ${className}`} />)}
    </div>
    <div data-sample="types" className="flex flex-col gap-1">
      {typeSamples.map(([name, className]) => <div key={name} data-type={name} className={className}>Gr8r Studio — Typography 012345</div>)}
      {[400, 450, 500, 600].map(weight => <div key={weight} data-weight={weight} className={{ 400: 'font-normal', 450: 'font-[450]', 500: 'font-medium', 600: 'font-semibold' }[weight]}>Geist weight {weight} — Workspace navigation</div>)}
      <div data-mono="" className="font-mono text-[0.92em] tracking-[-0.01em] tabular-nums">GR8-103 0123456789</div>
    </div>
    <div data-sample="geometry" className="flex items-center gap-2">
      <div data-row="" className="flex h-row w-sidebar items-center rounded-default border border-solid border-border bg-surface p-card shadow-elevation-card">Row and card geometry</div>
      <button data-hover="" className="h-control-md rounded-sm bg-accent px-3 text-on-accent source-hover:bg-accent-soft source-hover:text-accent">Focus / hover</button>
    </div>
    <div data-sample="shadows" className="flex gap-4">
      {['shadow-elevation-sm', 'shadow-elevation-card', 'shadow-elevation-pop', 'shadow-elevation-drag'].map((className, index) => <div key={className} data-shadow={index} className={`h-6 w-6 bg-surface ${className}`} />)}
    </div>
    <div data-sample="glyphs" className="flex items-center gap-2">
      {(['backlog', 'todo', 'progress', 'review', 'done'] satisfies StatusGlyph[]).map(status => <TaskStatusIcon key={status} status={status} />)}
      {(['urgent', 'high', 'medium', 'low', 'none'] satisfies PriorityGlyph[]).map(priority => <PriorityIcon key={priority} priority={priority} />)}
    </div>
    <div data-sample="icons" className="grid grid-cols-[repeat(24,16px)] gap-3">
      {(Object.keys(iconPaths) as IconName[]).map(name => <span key={name} data-icon={name}><Icon name={name} /></span>)}
    </div>
    <div data-breakpoints="" className="flex gap-2">
      <span data-wide="" className="hidden source-wide:block">1100</span>
      <span data-tablet="" className="hidden source-tablet:block">900</span>
      <span data-mobile="" className="hidden source-mobile:block">640</span>
    </div>
    <div data-motion="" className="h-1 w-1 animate-[riseIn_0.36s_var(--ease)_both] source-reduce:animate-[fadeOnly_0.12s_both]" />
  </section>;
}
