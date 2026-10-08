/* A source-only probe surface: original styles/fonts + original SVG helpers.
 * Static probe geometry is declared independently of target classes.
 * The source checkout, templates, stylesheet and official baseline are never edited. */
export async function sourceSample(page) {
  await page.waitForFunction(() => window.__gr8r);
  await page.evaluate(async () => {
    const { ic, LOGO } = await import('/src/core/icons.js');
    const { stIcon, prIcon } = await import('/src/ui/helpers.js');
    const { ICONS } = await import('/@id/__x00__virtual:icons');
    const type = [['2xs', 11], ['xs', 12], ['sm', 12.5], ['body', 13.5], ['md', 14.5], ['lg', 16], ['xl', 19], ['2xl', 23]];
    const surfaces = ['bg-side', 'surface', 'surface-2', 'surface-3', 'sunken', 'accent', 'accent-soft', 'green', 'amber', 'red'];
    const section = document.createElement('section');
    section.id = 'foundation-sample';
    section.style.cssText = 'display:flex;width:760px;flex-direction:column;gap:16px;background:var(--bg);padding:24px;color:var(--text)';
    section.innerHTML = `${LOGO()}<div data-sample="surfaces" style="display:flex;gap:8px">${surfaces.map((token, index) => `<div data-swatch="${index}" style="height:32px;width:32px;border-radius:var(--r-xs);border:1px solid var(--border);background:var(--${token})"></div>`).join('')}</div>
      <div data-sample="types" style="display:flex;flex-direction:column;gap:4px">${type.map(([name, size]) => `<div data-type="${name}" style="font-size:${size}px">Gr8r Studio — Typography 012345</div>`).join('')}${[400, 450, 500, 600].map(weight => `<div data-weight="${weight}" style="font-weight:${weight}">Geist weight ${weight} — Workspace navigation</div>`).join('')}<div data-mono style="font-family:var(--mono);font-size:0.92em;letter-spacing:-0.01em;font-variant-numeric:tabular-nums">GR8-103 0123456789</div></div>
      <div data-sample="geometry" style="display:flex;align-items:center;gap:8px"><div data-row style="display:flex;height:var(--row-h);width:var(--side-w);align-items:center;border-radius:var(--r);border:1px solid var(--border);background:var(--surface);padding:var(--card-pad);box-shadow:var(--shadow-card)">Row and card geometry</div><button data-hover style="height:var(--h-md);border-radius:var(--r-sm);background:var(--accent);padding:0 12px;color:var(--on-accent)">Focus / hover</button></div>
      <div data-sample="shadows" style="display:flex;gap:16px">${['sm','card','pop','drag'].map((name,index)=>`<div data-shadow="${index}" style="height:24px;width:24px;background:var(--surface);box-shadow:var(--shadow-${name})"></div>`).join('')}</div>
      <div data-sample="glyphs" style="display:flex;align-items:center;gap:8px">${['backlog', 'todo', 'progress', 'review', 'done'].map(st => stIcon(st)).join('')}${['urgent', 'high', 'medium', 'low', 'none'].map(pr => prIcon(pr)).join('')}</div>
      <div data-sample="icons" style="display:grid;grid-template-columns:repeat(24,16px);gap:12px">${Object.keys(ICONS).map(name => `<span data-icon="${name}">${ic(name)}</span>`).join('')}</div>
      <div data-breakpoints style="display:flex;gap:8px"><span data-wide>1100</span><span data-tablet>900</span><span data-mobile>640</span></div><div data-motion style="height:4px;width:4px"></div>`;
    const rules = document.createElement('style');
    rules.textContent = '#foundation-sample [data-wide],#foundation-sample [data-tablet],#foundation-sample [data-mobile]{display:none} @media(max-width:1100px){#foundation-sample [data-wide]{display:block}} @media(max-width:900px){#foundation-sample [data-tablet]{display:block}} @media(max-width:640px){#foundation-sample [data-mobile]{display:block}} #foundation-sample [data-hover]:hover{background:var(--accent-soft)!important;color:var(--accent)!important} #foundation-sample [data-motion]{animation:riseIn .36s var(--ease) both} @media(prefers-reduced-motion:reduce){#foundation-sample [data-motion]{animation:fadeOnly .12s both}} :root[data-motion="reduce"] #foundation-sample [data-motion]{animation:fadeOnly .12s both}';
    // Preserve source-owned roots for its resize/render listeners; keep them outside the probe.
    const sourceHost = document.createElement('div'); sourceHost.hidden = true;
    sourceHost.append(...document.body.childNodes);
    document.body.append(section, rules, sourceHost);
  });
}
export async function sourcePreferences(page, values) {
  await page.evaluate(async values => {
    const { S } = window.__gr8r;
    Object.assign(S.prefs, values);
    const { applyPrefs } = await import('/src/core/theme.js');
    applyPrefs();
  }, values);
}
