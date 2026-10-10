import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
export interface NormalizedDescription { html: string; text: string }
const allowed = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h4', 'a']);
const discard = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript']);
const block = new Set(['p', 'ul', 'ol', 'li', 'h4']);
const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttribute = (text: string) => escapeText(text).replaceAll('"', '&quot;');
// A real HTML5 parser, with no DOM/runtime dependency. All output is rebuilt from
// an allowlisted tree; raw source, foreign namespaces and attributes never pass.
export function normalizeDescription(input: string): NormalizedDescription {
  if (input.length > 100000) throw new RangeError('Description exceeds 100000 characters');

  function visit(node: DefaultTreeAdapterMap['node'], depth: number): string {
    if (depth > 128) return '';
    if (node.nodeName === '#text') { const value = (node as DefaultTreeAdapterMap['textNode']).value; return escapeText(value); }
    if (!('tagName' in node)) return '';
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || discard.has(node.tagName)) return '';
    const tag = node.tagName === 'b' ? 'strong' : node.tagName === 'i' ? 'em' : node.tagName;
    const children = node.childNodes.map(child => visit(child, depth + 1)).join('');
    if (!allowed.has(tag)) return children;
    if (tag === 'br') return '<br>';
    let attrs = '';
    if (tag === 'a') {
      const href = node.attrs.find(attr => attr.name === 'href')?.value.trim();
      if (href) { try { if (/^https?:\/\//iu.test(href)) { attrs = ` href="${escapeAttribute(href)}"`; if (node.attrs.some(attr => attr.name === 'target' && attr.value === '_blank')) attrs += ' target="_blank" rel="noopener noreferrer"'; } } catch { /* unsafe or relative link: text only */ } }
    }
    return `<${tag}${attrs}>${children}</${tag}>`;
  }
  const html = parseFragment(input).childNodes.map(node => visit(node, 0)).join('');
  function textOf(node: DefaultTreeAdapterMap['node']): string {
    if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
    if (!('tagName' in node)) return '';
    const children = node.childNodes.map(textOf).join('');
    return block.has(node.tagName) || node.tagName === 'br' ? ` ${children} ` : children;
  }
  return { html, text: parseFragment(html).childNodes.map(textOf).join('').replace(/\s+/gu, ' ').trim() };
}
export function plainDescriptionHtml(text: string): string { return text ? `<p>${escapeText(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '<br>')}</p>` : ''; }
