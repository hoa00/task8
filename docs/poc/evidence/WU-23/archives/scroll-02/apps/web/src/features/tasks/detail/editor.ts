import { normalizeDescription, plainDescriptionHtml } from '@studio/domain';
export type DescriptionCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'formatBlock:h4' | 'createLink';
interface SelectionBookmark { anchor: number; focus: number }
function textOffset(root: HTMLElement, node: Node, offset: number): number { const range = document.createRange(); range.selectNodeContents(root); range.setEnd(node, offset); return range.toString().length; }
export function descriptionSelection(root: HTMLElement): SelectionBookmark | null { const selection = window.getSelection(); if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null; return { anchor: textOffset(root, selection.anchorNode, selection.anchorOffset), focus: textOffset(root, selection.focusNode, selection.focusOffset) }; }
export function restoreDescriptionSelection(root: HTMLElement, bookmark: SelectionBookmark | null): void {
 if (!bookmark) return;
 const locate = (offset: number): [Node, number] => { const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node: Node | null; while ((node = walker.nextNode())) { const length = node.textContent?.length ?? 0; if (offset <= length) return [node, offset]; offset -= length; } return [root, root.childNodes.length]; };
 const [anchor, anchorOffset] = locate(bookmark.anchor), [focus, focusOffset] = locate(bookmark.focus); window.getSelection()?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}
// The only HTML boundary is the shared HTML5 tree sanitizer. Rebuild unsafe/native
// markup while retaining directional text selection; React never owns editor children.
export function serializeDescription(root: HTMLElement): string { const bookmark = descriptionSelection(root), html = normalizeDescription(root.innerHTML).html; if (root.innerHTML !== html) { root.innerHTML = html; restoreDescriptionSelection(root, bookmark); } return html; }
export function executeDescriptionCommand(root: HTMLElement, command: DescriptionCommand): boolean {
 const selection = window.getSelection(); if (!selection?.anchorNode || !root.contains(selection.anchorNode)) return false;
 if (command === 'createLink') { const text = selection.toString(); try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol) || !/^https?:\/\//u.test(text)) return false; } catch { return false; } document.execCommand('createLink', false, text); }
 else if (command === 'formatBlock:h4') document.execCommand('formatBlock', false, '<h4>'); else document.execCommand(command, false);
 return true;
}
export function pasteDescription(root: HTMLElement, html: string, text: string): string { const clean = html ? normalizeDescription(html).html : plainDescriptionHtml(text); document.execCommand('insertHTML', false, clean); return serializeDescription(root); }
// Native drop inserts HTML before input listeners run. Normalize at the drop
// boundary and use the browser caret position; an internal move retains its
// original live Range so deletion adjusts the target Range before insertion.
export function dropDescription(root: HTMLElement, html: string, text: string, point: { x: number; y: number }, source: Range | null): string | null {
 const clean = html ? normalizeDescription(html).html : plainDescriptionHtml(text);
 const caret = document.caretRangeFromPoint(point.x, point.y);
 if (!clean || !caret || !root.contains(caret.startContainer)) return null;
 if (source && !source.collapsed && root.contains(source.startContainer) && root.contains(source.endContainer)) { if (source.comparePoint(caret.startContainer, caret.startOffset) === 0) return null; source.deleteContents(); }
 root.focus({ preventScroll: true }); caret.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(caret);
 document.execCommand('insertHTML', false, clean); return serializeDescription(root);
}
