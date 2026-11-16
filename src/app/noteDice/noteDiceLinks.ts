import { t } from '../i18n';
import { rollPieces } from '../tools/textRolls';
import { parseFormula } from '../tools/parseFormula';

const STATBLOCK = '.atlas-statblock, .atlas-statblock-fence, .atlas-sb-markdown';
const SKIP = `a, button, input, textarea, select, pre, code, svg, script, style, [contenteditable], ${STATBLOCK}, .atlas-note-dice-link`;

function makeLink(doc: Document, text: string, formula: string): HTMLElement {
  const link = doc.defaultView!.createSpan();
  link.className = 'atlas-note-dice-link';
  link.textContent = text;
  link.dataset.formula = formula;
  link.setAttribute('role', 'button');
  link.setAttribute('tabindex', '0');
  link.setAttribute('aria-label', t('dice.rollFormula', { formula }));
  return link;
}

/** Adds roll links to rendered note text and inline code containing a complete formula. */
export function linkNoteDice(root: HTMLElement): boolean {
  if (root.closest(STATBLOCK)) return false;
  let linked = false;
  for (const code of root.querySelectorAll<HTMLElement>('code')) {
    if (code.querySelector('.atlas-note-dice-link') || code.closest(`pre, a, button, [contenteditable], ${STATBLOCK}, .atlas-note-dice-link`)) continue;
    const text = code.textContent ?? '';
    const prefix = /^[ \t]*dice:[ \t]?/i.exec(text);
    const expression = prefix ? text.slice(prefix[0].length) : text;
    if (!parseFormula(expression).ok) continue;
    const formula = expression.replace(/^[ \t]+|[ \t]+$/g, '');
    if (!prefix && !/^\d+d\d+/i.test(formula)) continue;
    code.replaceChildren(makeLink(root.ownerDocument, formula, formula));
    linked = true;
  }
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(SKIP)) nodes.push(node as Text);
  }
  for (const node of nodes) {
    const pieces = rollPieces(node.data);
    if (!pieces.some((piece) => piece.formula !== null)) continue;
    const fragment = root.ownerDocument.defaultView!.createFragment();
    for (const piece of pieces) {
      if (piece.formula !== null) {
        fragment.append(makeLink(root.ownerDocument, piece.text, piece.formula));
      } else {
        fragment.append(piece.text);
      }
    }
    node.replaceWith(fragment);
    linked = true;
  }
  return linked;
}
