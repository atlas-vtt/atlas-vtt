/**
 * What an ability drag shows (spec §7.2): a copy of the ability on an
 * elevated surface, held inside its list; the drop line across the list; the
 * list's bounds, outlined, one per column it runs through; and the abilities
 * between the two places sliding aside. The copy, line and bounds live in a
 * fixed layer in the document's own body (`contain: strict` on Obsidian's
 * leaves would pin them otherwise); the slides are transforms on the
 * abilities themselves, so nothing reflows.
 */

import { prefersReducedMotion } from '../../../utils/motion';
import type { Box, DropLine } from './dropGeometry';
import type { Shift } from './siblingShifts';

/** Marks the ability being moved: it stays in place, dimmed. */
export const LIST_DRAGGING_ATTRIBUTE = 'data-sb-dragging';
/** Marks an ability that slides aside; its stylesheet animates the transform. */
export const LIST_SHIFT_ATTRIBUTE = 'data-sb-shift';
/** How far the copy's surface stands out around the ability's text, so the text in it lies exactly where the ability's lies. */
export const GHOST_INSET = 6;

export interface ListDragFrame {
  /** The copy's top-left, and the fragment it is held in. */
  ghost: { left: number; top: number; bounds: Box };
  line: DropLine | null;
  slides: ReadonlyMap<string, Shift> | null;
  elements: readonly HTMLElement[];
  keys: readonly string[];
  fragments: readonly Box[];
}

/** A div appended to `parent`, made by the parent's own document (a popout's included). */
function div(parent: HTMLElement, classes: readonly string[]): HTMLElement {
  return parent.createDiv({ cls: [...classes] });
}

function place(element: HTMLElement, box: Box): void {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.right - box.left}px`;
  element.style.height = `${box.bottom - box.top}px`;
}

/** A copy of the ability as drawn, with the text typed into its inputs (a clone copies attributes, not values). */
function copyOf(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  copy.removeAttribute(LIST_DRAGGING_ATTRIBUTE);
  copy.removeAttribute('data-item-key');
  copy.removeAttribute('data-sb-hover');
  copy.removeAttribute('data-sb-menu-target');
  const typed = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((field, index) => {
    field.value = typed[index]?.value ?? field.value;
    field.tabIndex = -1;
  });
  return copy;
}

export class ListDragView {
  private readonly layer: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly line: HTMLElement;
  private readonly bounds: HTMLElement[] = [];
  private readonly shifted = new Set<HTMLElement>();
  private readonly height: number;

  constructor(doc: Document, private readonly source: HTMLElement, fragments: readonly Box[]) {
    const box = source.getBoundingClientRect();
    this.height = box.height;
    this.layer = div(doc.body, ['atlas-vtt-plugin', 'atlas-list-drag-layer']);
    for (const fragment of fragments) {
      const bound = div(this.layer, ['atlas-list-drag-bound']);
      place(bound, fragment);
      this.bounds.push(bound);
    }
    this.line = div(this.layer, ['atlas-list-drag-line']);
    this.line.hidden = true;
    // The copy keeps the card's classes, so its text is set as on the card and the companion theme reaches it.
    const sheet = source.closest('.atlas-statblock');
    this.ghost = div(this.layer, ['atlas-statblock', 'atlas-sb-sheet', 'atlas-list-drag-ghost']);
    const template = sheet?.getAttribute('data-template');
    if (template) this.ghost.setAttribute('data-template', template);
    if (!prefersReducedMotion(source)) this.ghost.setAttribute('data-lifted', '');
    this.ghost.style.width = `${box.width + 2 * GHOST_INSET}px`;
    this.ghost.style.setProperty('--atlas-list-ghost-inset', `${GHOST_INSET}px`);
    this.ghost.append(copyOf(source));
    source.setAttribute(LIST_DRAGGING_ATTRIBUTE, '');
  }

  show(frame: ListDragFrame): void {
    // Held in its list: only its height moves, its left edge stays on the list's.
    const { bounds } = frame.ghost;
    const top = Math.min(Math.max(frame.ghost.top, bounds.top), Math.max(bounds.top, bounds.bottom - this.height));
    this.ghost.style.transform = `translate3d(${frame.ghost.left - GHOST_INSET}px, ${top - GHOST_INSET}px, 0)`;
    frame.fragments.forEach((fragment, index) => {
      const bound = this.bounds[index];
      if (bound) place(bound, fragment);
    });
    this.line.hidden = frame.line === null;
    if (frame.line) {
      this.line.style.left = `${frame.line.x}px`;
      this.line.style.top = `${frame.line.y}px`;
      this.line.style.width = `${frame.line.length}px`;
    }
    this.slide(frame);
  }

  private slide(frame: ListDragFrame): void {
    const next = new Set<HTMLElement>();
    frame.keys.forEach((key, index) => {
      const shift = frame.slides?.get(key);
      const element = frame.elements[index];
      if (!shift || !element) return;
      next.add(element);
      element.setAttribute(LIST_SHIFT_ATTRIBUTE, '');
      element.style.transform = `translate(${shift.x}px, ${shift.y}px)`;
    });
    for (const element of this.shifted) if (!next.has(element)) element.style.removeProperty('transform');
    for (const element of next) this.shifted.add(element);
  }

  /** Takes the copy, line and bounds away; the abilities snap back without a transition, as the list takes the drop. */
  remove(): void {
    this.layer.remove();
    this.source.removeAttribute(LIST_DRAGGING_ATTRIBUTE);
    for (const element of this.shifted) {
      element.removeAttribute(LIST_SHIFT_ATTRIBUTE);
      element.style.removeProperty('transform');
    }
    this.shifted.clear();
  }
}
