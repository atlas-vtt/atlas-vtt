import type { DrawnNode } from '../../src/app/online/protocol/index';

/**
 * A drawn statblock built as elements, as a device's page builds it: element by element, classes, data
 * attributes and style properties set one by one, never as HTML. `picture` gives the address a portrait is
 * shown from, by its hash.
 */
export function buildDrawnTree(nodes: readonly DrawnNode[], parent: HTMLElement, picture: (hash: string) => string): void {
  for (const node of nodes) {
    if (typeof node === 'string') {
      parent.append(parent.ownerDocument.createTextNode(node));
      continue;
    }
    const element = parent.ownerDocument.createElement(node.e);
    if (node.c) element.classList.add(...node.c);
    for (const [name, value] of Object.entries(node.d ?? {})) element.setAttribute(`data-${name}`, value);
    for (const [name, value] of Object.entries(node.s ?? {})) element.style.setProperty(name, value);
    if (node.colspan) element.setAttribute('colspan', String(node.colspan));
    if (node.rowspan) element.setAttribute('rowspan', String(node.rowspan));
    if (node.src && element instanceof HTMLImageElement) element.src = picture(node.src);
    buildDrawnTree(node.k ?? [], element, picture);
    parent.append(element);
  }
}
