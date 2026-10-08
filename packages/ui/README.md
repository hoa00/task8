# @studio/ui foundation

Public React icons use locked Lucide0.460.0 paths, viewBox24, stroke1.8 and source custom status/priority glyphs. Static geometry uses Tailwind; props contain values and callbacks, with no app/router/data imports.

Import `@studio/ui/styles.css` after explicit Tailwind theme/utilities imports. Preflight stays disabled. Source properties own exact values; theme mapping adds semantic utilities (`bg-canvas`, `text-body`, `h-row`, `w-sidebar`, `p-card`, `shadow-elevation-card`). Source variants preserve inclusive1100/900/640, unguarded hover, OS/preference reduced motion and dark mode.

Font descriptors remain fixed400/500/600 for Geist and400 for Mono with exact locked bytes;450 follows source browser weight matching. Font/ISC notices are in `src/assets`; app/design/logo distribution rights remain covered by the upstream audit, not these notices.

`@studio/ui/foundation-sample` is only a verification surface. `pnpm foundation:audit` and `pnpm visual:foundation` exercise it through the production web build and original source in one pinned runner. CSS exceptions and limitations are recorded in `docs/poc/VISUAL_PARITY.md`.
