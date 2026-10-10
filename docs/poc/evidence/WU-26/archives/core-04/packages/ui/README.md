# @studio/ui foundation

Public React icons use locked Lucide0.460.0 paths, viewBox24, stroke1.8 and source custom status/priority glyphs. Static geometry uses Tailwind; props contain values and callbacks, with no app/router/data imports.

Import `@studio/ui/styles.css` after explicit Tailwind theme/utilities imports. Preflight stays disabled. Source properties own exact values; theme mapping adds semantic utilities (`bg-canvas`, `text-body`, `h-row`, `w-sidebar`, `p-card`, `shadow-elevation-card`). Source variants preserve inclusive1100/900/640, unguarded hover, OS/preference reduced motion and dark mode.

Font descriptors remain fixed400/500/600 for Geist and400 for Mono with exact locked bytes;450 follows source browser weight matching. Font/ISC notices are in `src/assets`; app/design/logo distribution rights remain covered by the upstream audit, not these notices.

`@studio/ui/foundation-sample` is only a verification surface. `pnpm foundation:audit` and `pnpm visual:foundation` exercise it through the production web build and original source in one pinned runner. CSS exceptions and limitations are recorded in `docs/poc/VISUAL_PARITY.md`.

WU-04 adds generic controlled primitives. `Button`/`IconButton` have `xs/sm/md/lg` heights22/26/30/36; Button visual variants are primary/secondary/ghost/danger/dangerGhost. Loading buttons retain the source spinner appearance and use native disabled plus aria-busy to prevent keyboard activation. Standard refs and native input attributes reach their controls.

`Input`/`Textarea` accept a string value and native onChange. `Checkbox`/`Toggle` use checked/onCheckedChange; Checkbox also accepts controlled indeterminate/round. `PasswordInput` uses revealed/onRevealedChange and retains source wrapped-input30px left padding. `Field` provides id/aria-invalid/aria-describedby through a render child, so labels and error/hint text connect without a DOM enhancer:

```tsx
<Field label="Email" error={error}>
  {control => <Input {...control} value={email} onChange={event => setEmail(event.target.value)} />}
</Field>
```

`Tabs` and `SegmentedControl` receive items/value/onValueChange and label, skip disabled items with arrow/Home/End navigation, and expose a root ref. Callers own tab panels and may supply panelId. `Select` receives label/options/value/onValueChange, optional controlled open/onOpenChange, disabled/error, native form name and a trigger ref. Its own fixed listbox preserves source geometry/motion and handles arrows/Home/End/Escape/Tab/outside/resize; it does not register a shared overlay stack. Disabled options cannot be selected. Refs/handlers belong to the React primitives; no target DOM enhancement runs.

Display primitives (`Badge`, `ColorDot`, `AvatarBase`, `AvatarStackBase`, panels, `Progress`, `StackedBar`, `Meter`, `Alert`, `EmptyState`, `Skeleton`, `KeyHint`) receive generic content/values/colors. They never resolve member/task IDs. Dynamic progress/avatar geometry uses typed inline styles; layout and variants use literal Tailwind utilities.

The isolated production gallery is `/controls.html` (Vite dev/preview), separate from router/AppShell. `pnpm visual:controls` compares it with independent locked-source samples and exercises controlled rerenders/keyboard/validation. Evidence and CSS exceptions are recorded in `docs/poc/evidence/WU-04` and `docs/poc/VISUAL_PARITY.md`. Later units integrate and complete app galleries.

With Preflight disabled, a side border needs `border-0` plus the side width (for example `border-0 border-b border-solid border-border`) or a side-specific border style. Applying border-solid alone enables browser medium-width borders on unspecified edges. Circular source shapes use explicit50% radius, including the fractional30% avatar presence dot; rounded-full's999px token can paint differently at fractional geometry.

WU-05 adds `OverlayProvider` and `Portal`; mount one provider above the controlled surfaces. The provider owns a small ordered layer registry and one Escape/outside/focus listener set. Child layers stay after their parents even during initial-open layout effects. Dialog modal depth counts dialogs, so a confirm opened in a drawer starts at61; a second modal uses63. Drawer mode defaults to nonmodal without a scrim, while modal mode traps focus and restores the exact prior body overflow/padding. Initial/return focus refs and normal component refs reach the surface. Portaled child popovers belong to their parent focus scope.

`Dialog` accepts open/onOpenChange, size420/560/720, modal/drawer mode and typed dismiss reasons. `DialogHeader`/`DialogBody`/`DialogFooter` own generic content only. `Popover`/`Menu`/`ContextMenu` accept an anchor ref, placement or point; collision uses the source8px viewport boundary and source4px offset, with scroll/resize/ResizeObserver and ancestor animation/transition-end updates. Menu arrows wrap, Home/End and typeahead skip disabled items; native Enter/Space calls a typed MenuItem onSelect once. Callers own state and close on selection. Tooltip accepts open/onOpenChange/anchor/label,350ms hover/focus delay,6px bottom/top or8px side offsets, portal z200 and aria-describedby cleanup.

`useToastQueue` returns items/enqueue/dismiss/clear. `ToastViewport` also accepts any controlled items/onDismiss, showing at most3 by default and promoting queued items after dismiss. Toast durations default4200ms;0 disables expiry. Hover/focus pauses expiry; typed action callbacks run once and then dismiss after the160ms exit animation. Features supply Undo callbacks; UI never saves or restores workspace snapshots. The isolated production gallery is `/overlays.html`; hidden provider toggle is only a lifecycle test control. WU-04 Select keeps its separate listbox controller; it has not been reopened or silently moved into this stack.

Overlay motion is one-shot per mount; scrim/dialog/popover/drawer clear the completed entering animation after animationend and keep their DOM/focus/draft. Full/system retain source timings260/160/340ms, Toast200ms; reduced motion uses the original fadeOnly120ms. Mobile<=640 uses bottom-sheet92vh/radius14, full-width drawer, and Toast bottom76px. Original overlay CSS has no env safe-area offset; do not invent one. The source bottom navigation safe-area expression belongs to the later shell unit.

WU-05 reopened only Button active motion from WU-04: source uses transform:scale(.97) and its transform140ms/default ease transition, with transform:none in reduce mode. Literal individual scale was corrected; affected Button visuals and timing are reverified. Select remains unchanged. Toast Dismiss preserves the source inline color:inherit override; generic IconButton color stays unchanged.
