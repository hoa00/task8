export async function setupScenario(page, scenario) {
  await page.evaluate(async scenario => {
    const { S, A, go, render } = window.__gr8r;
    const { viewOf } = await import('/src/shell/view-engine.js');
    const { openModal } = await import('/src/overlays/modals.js');
    const { toast } = await import('/src/ui/toast.js');
    Object.assign(S.prefs, scenario.prefs || {});
    go(scenario.route, scenario.params || {});
    Object.assign(S.ui, scenario.ui || {});
    S.ui.auth = scenario.auth || null;
    if (scenario.taskMode) viewOf('tasks').mode = scenario.taskMode;
    if (scenario.selected) S.ui.sel = new Set(S.data.tasks.filter(t => t.project === 'p1').slice(0, 3).map(t => t.id));
    render();
    if (scenario.drawer) {
      A.openTask({ dataset: { id: scenario.drawer } });
      S.ui.drawerFull = !!scenario.drawerFull;
      S.ui.drawerTab = scenario.drawerTab || 'comments';
      if (scenario.subtask) S.ui.subOpen = { tid: scenario.drawer, sid: S.data.tasks.find(t => t.id === scenario.drawer).subtasks[0].id };
      render();
    }
    if (scenario.modal) {
      const el = { dataset: { id: scenario.params?.id || 'p1', key: 'p:p1' } };
      const actions = { task: 'newTask', project: 'newProject', share: 'share', invite: 'invite', shortcuts: 'shortcuts', team: 'newTeam', filePreview: 'previewFile', saveView: 'saveView' };
      if (scenario.modal === 'filePreview') el.dataset.id = S.data.files[0].id;
      if (actions[scenario.modal]) A[actions[scenario.modal]](el);
      else if (scenario.modal === 'prompt') openModal({ type: 'prompt', title: 'Rename project', label: 'Project name', value: S.data.projects[0].name });
      else openModal({ type: 'confirm', title: 'Delete project?', body: 'This action cannot be undone.', ok: 'Delete project', danger: true, typeName: S.data.projects[0].name });
    }
    if (scenario.palette) A[scenario.palette === 'search' ? 'openSearch' : 'openPalette']();
    if (scenario.popover) {
      const type = scenario.popover;
      if (type === 'fvals') viewOf('tasks').filters = [{ f: 'status', op: 'is', v: ['todo'] }];
      if (type.startsWith('bulk-')) S.ui.sel = new Set([S.data.tasks[0].id]);
      render();
      const selector = type === 'ctx' ? '[data-a="ctxBtn"][data-ctx="task"]' : `[data-pop="${type}"]`;
      const owner = scenario.drawer ? document.querySelector('.drawer') : document;
      const anchor = [...owner.querySelectorAll(selector)].find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).display !== 'none';
      });
      if (!anchor) throw new Error(`Unavailable source opener: ${type}`);
      anchor.scrollIntoView({ block: 'nearest' });
      if (type === 'ctx') A.ctxBtn(anchor);
      else A.pop(anchor);
    }
    if (scenario.drawerScroll !== undefined) {
      const scroller = document.querySelector('.drawer-b');
      scroller.scrollTop = scenario.drawerScroll === 'bottom' ? scroller.scrollHeight : scenario.drawerScroll;
    }
    if (scenario.toast) toast('Link copied', { kind: 'ok', ms: 60000 });
  }, scenario);
  for (const selector of scenario.clicks || []) await page.locator(selector).first().click();
  if (scenario.drawer) await page.locator('.drawer').waitFor();
  if (scenario.modal) await page.locator('.modal').last().waitFor();
  if (scenario.popover) await page.locator('.pop.floating').waitFor();
  if (scenario.palette) await page.locator('#pal-in').waitFor();
}

export async function readiness(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const spec of ['400 13.5px Geist', '500 13.5px Geist', '600 13.5px Geist', '400 13.5px "Geist Mono"']) {
      const faces = await document.fonts.load(spec, 'Gr8r Studio 123');
      if (!faces.length || faces.some(face => face.status !== 'loaded')) throw new Error(`Font fallback: ${spec}`);
    }
    await Promise.all([...document.images].map(img => img.decode()));
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect.getComputedTiming().iterations)).map(animation => animation.finished.catch(() => {})));
    // Loading shimmer/spinners have no settled end; capture their original first frame at a fixed phase.
    for (const animation of document.getAnimations().filter(animation => !Number.isFinite(animation.effect.getComputedTiming().iterations))) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  // countUp uses requestAnimationFrame for 520ms; compare settled text AND geometry before accepting a frame.
  await page.waitForTimeout(600);
  const measure = () => page.evaluate(() => ({
    text: document.querySelector('#app').innerText,
    boxes: [...document.querySelectorAll('.page,.ph,.topbar,.side,.drawer,.modal,.pop,.stat .v,.board-col,.set-body')].map(el => {
      const r = el.getBoundingClientRect();
      return [el.className, r.x, r.y, r.width, r.height];
    }),
  }));
  let previous = await measure();
  let stable = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(100);
    const current = await measure();
    if (JSON.stringify(current) === JSON.stringify(previous)) { stable = true; break; }
    previous = current;
  }
  if (!stable || previous.text.length < 60) throw new Error('Empty or unsettled source surface');
  return page.evaluate(() => ({
    fonts: [...document.fonts].map(face => ({ family: face.family, weight: face.weight, status: face.status, unicodeRange: face.unicodeRange })),
    images: [...document.images].map(img => ({ src: img.currentSrc, decoded: img.complete && img.naturalWidth > 0 })),
    title: document.title, platform: navigator.platform, userAgent: navigator.userAgent,
    fontFamily: getComputedStyle(document.body).fontFamily, fontSize: getComputedStyle(document.body).fontSize,
    animations: document.getAnimations().map(animation => ({ name: animation.animationName || null, playState: animation.playState, currentTime: animation.currentTime, iterations: Number.isFinite(animation.effect.getComputedTiming().iterations) ? animation.effect.getComputedTiming().iterations : 'infinite' })),
    icon: (() => { const el = document.querySelector('svg.i'); return el ? { viewBox: el.getAttribute('viewBox'), strokeWidth: el.getAttribute('stroke-width'), samplePath: el.innerHTML } : null; })(),
    scroll: [...document.querySelectorAll('[data-keep],.content')].map(el => ({ key: el.dataset.keep || el.className, top: el.scrollTop, left: el.scrollLeft })),
    geometry: [...document.querySelectorAll('.page,.topbar,.side,.drawer,.modal,.pop,.cal-g')].map(el => {
      const r = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { selector: el.className, x: r.x, y: r.y, width: r.width, height: r.height, display: style.display, gridTemplateRows: style.gridTemplateRows };
    }),
    state: (() => { const { S } = window.__gr8r; return { route: S.ui.route, params: S.ui.params, auth: S.ui.auth, onb: S.ui.onb, prefs: S.prefs, drawer: S.ui.drawer, drawerFull: S.ui.drawerFull, pop: S.ui.pop, modals: S.ui.modals, palette: S.ui.palette }; })(),
  }));
}
