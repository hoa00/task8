import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export async function qualifiedRegions(source, target, row) {
 if (row.route === 'projects') {
  const ids = ['p6', 'p7'];
  const sides = await Promise.all([source, target].map((page, side) => page.evaluate(({ ids, side, mapped }) => ids.flatMap(id => {
   const selector = side === 0 ? `.page .pcard[data-id="${id}"],.page .mini[data-r="project"][data-id="${id}"],.page tr[data-r="project"][data-id="${id}"]` : `[data-project-card="${mapped[id]}"],[data-project-row="${mapped[id]}"],[data-project-table-row="${mapped[id]}"]`;
   return [...document.querySelectorAll(selector)].map(el => ({ id, selector, rect: el.getBoundingClientRect().toJSON(), text: el.innerText, style: Object.fromEntries(['backgroundColor','border','borderRadius','padding','gap','fontFamily','fontSize','fontWeight','lineHeight','color','boxShadow'].map(key => [key, getComputedStyle(el)[key]])) }));
  }), { ids, side, mapped: Object.fromEntries(ids.map(id => [id, sourceId('projects', id)])) })));
  return { kind: 'canonical-restricted-project-records', reason: 'RestrictedProjectDto omits inaccessible member/team/footer lastActivityAt; the canonical recent comparator has no restricted lastActivityAt and therefore places p6 after completed p7. Exact union of the two affected records; no Source field/style/sort substitution.', sides, bounds: sides.flat().map(record => record.rect) };
 }
 if (row.route === 'archive') {
  const sides = await Promise.all([source, target].map((page, side) => page.evaluate(side => {
   const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let node;
   while ((node = walker.nextNode())) {
    const text = node.textContent, phrase = side === 0 ? ', or delete it for good.' : ', or delete it.';
    const start = text.indexOf(phrase); if (start < 0) continue;
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + phrase.length);
    const el = node.parentElement;
    return { text, phrase, start, end: start + phrase.length, bounds: [...range.getClientRects()].map(rect => rect.toJSON()), style: Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','color','letterSpacing'].map(key => [key, getComputedStyle(el)[key]])) };
   }
   throw Error('Exact Archive copy range missing');
  }, side)));
  return { kind: 'truthful-irreversible-copy-correction', reason: 'Canonical archived delete returns one-use Undo; remove only Source “for good” permanence claim. Exact DOMRange of changed suffix on both sides.', sides, bounds: sides.flatMap(record => record.bounds) };
 }
 return null;
}

export function partitionPixels(a, b, regions) {
 let inside = 0, outside = 0;
 for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
  const offset = (y * a.width + x) * 4;
  if (a.data.subarray(offset, offset + 4).equals(b.data.subarray(offset, offset + 4))) continue;
  const qualified = regions.bounds.some(rect => rect.width > 0 && rect.height > 0 && x >= Math.floor(rect.x) && x < Math.ceil(rect.x + rect.width) && y >= Math.floor(rect.y) && y < Math.ceil(rect.y + rect.height));
  if (qualified) inside++; else outside++;
 }
 return { inside, outside, total: inside + outside, rule: 'Exact RGBA changed pixels counted after whole-viewport capture; partition by measured record/DOMRange union without altering or masking either image' };
}
