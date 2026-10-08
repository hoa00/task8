/* Independent original-style/SVG overlay surface. Original roots stay hidden for resize listeners. */
export async function sourceOverlays(page, scenario, popup = false, entering = false) {
  await page.waitForFunction(() => window.__gr8r);
  await page.evaluate(async ({ scenario, popup, entering }) => {
    const { ic } = await import('/src/core/icons.js');
    const { placePop } = await import('/src/overlays/popovers.js');
    const section = document.createElement('main'); section.id = 'overlay-sample';
    section.style.cssText = 'position:fixed;inset:0;background:var(--bg);padding:24px;color:var(--text)';
    const button = label => `<button class="btn btn-secondary">${label}</button>`;
    const close = `<button class="ibtn ibtn-sm" aria-label="Close">${ic('x',16)}</button>`;
    const menu = `<div class="mh">Actions</div><button class="mi">${ic('pencil',15)}Edit item</button><button class="mi" disabled>${ic('copy',15)}Unavailable</button><button class="mi" aria-checked="true">${ic('star',15)}Favorite<span class="ck">${ic('check',14)}</span></button><div class="msep"></div><button class="mi danger">${ic('trash-2',15)}Delete item</button>`;
    const inside = `<input class="input" aria-label="Draft" value="Homepage wireframes"><div style="display:flex;align-items:center;gap:8px">${button('Options')}${button('Confirm')}</div>`;
    const header = (title) => `<div class="modal-h"><h2>${title}</h2>${close}</div>`;
    const footer = (ok) => `<div class="modal-f"><span class="sp"></span>${button('Cancel')}<button class="btn btn-primary">${ok}</button></div>`;
    section.innerHTML = `<div style="display:flex;gap:12px">${button('Open overlay')}<div style="height:120px;width:260px;overflow:auto;border:1px solid var(--border);padding:12px">${button('Context target')}<div style="height:240px"></div></div><button class="ibtn ibtn-sm" aria-label="Tooltip target" data-tip="Helpful information">${ic('info',16)}</button></div>`;
    const sourceHost = document.createElement('div'); sourceHost.hidden = true; sourceHost.append(...document.body.childNodes); const sampleRoot=document.createElement('div');sampleRoot.style.height='100%';document.body.append(sampleRoot,sourceHost);sampleRoot.append(section);
    const overlayHost = document.createElement('div'); overlayHost.dataset.sourceOverlayHost=''; section.parentElement.append(overlayHost);
    if(['modal','drawer','nested','modal-sm','modal-lg'].includes(scenario)){
      if(scenario==='drawer') overlayHost.innerHTML = `<section class="drawer"><div class="drawer-h"><b style="font-weight:600">Drawer shell</b>${close.replace('class="ibtn ibtn-sm"','class="ibtn ibtn-sm" style="margin-left:auto"')}</div><div class="drawer-b" style="display:flex;flex-direction:column;gap:14px">${inside}</div></section>`;
      else overlayHost.innerHTML = `<div class="scrim"></div><div class="modal-wrap"><section class="modal ${scenario==='modal-sm'?'sm':scenario==='modal-lg'?'lg':''}">${header('Edit draft')}<div class="modal-b">${inside}</div>${footer('Save')}</section></div>`;
      overlayHost.querySelector('input').focus({preventScroll:true});
      if(scenario==='nested'){
        const nested=document.createElement('div');nested.innerHTML=`<div class="scrim" style="z-index:62"></div><div class="modal-wrap" style="z-index:63"><section class="modal sm">${header('Confirm change')}<div class="modal-b"><p style="margin:0">Apply this change?</p></div>${footer('Apply')}</section></div>`;overlayHost.append(nested);nested.querySelector('button').focus({preventScroll:true});
      }
    }
    if(scenario==='menu'||scenario==='context'||popup){
      const pop=document.createElement('div');pop.className='pop floating';pop.innerHTML=menu;overlayHost.append(pop);
      const anchor=popup?[...overlayHost.querySelectorAll('button')].find(el=>el.textContent==='Options'):scenario==='context'?[...section.querySelectorAll('button')].find(el=>el.textContent==='Context target'):section.querySelector('button');
      const r=anchor.getBoundingClientRect();window.__gr8r.S.ui.pop=scenario==='context'?{x:300,y:100,top:100}:{x:r.left,y:r.bottom+4,top:r.top,w:r.width};placePop();pop.querySelector('[aria-checked=true]').focus({preventScroll:true});
    }
    if(scenario==='toast'){
      const toasts=sourceHost.querySelector('#toasts');document.body.append(toasts);
      const { toast }=await import('/src/ui/toast.js');toast('Changes saved.',{action:'Undo',ms:60000});
    }
    if(entering){for(const el of overlayHost.querySelectorAll('.modal,.drawer,.pop'))el.classList.add('enter');for(const animation of document.getAnimations())if(animation instanceof CSSAnimation && animation.effect?.target?.matches('.modal,.drawer,.pop,.toast'))animation.pause();}
  },{scenario,popup,entering});
}
