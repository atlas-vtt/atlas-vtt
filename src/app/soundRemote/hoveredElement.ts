import type { Workspace } from 'obsidian';
import { followEveryDocument } from '../platform/atlasDocuments';

/**
 * The element under the pointer in any Obsidian window, for a remote key that acts on what the GM
 * hovers. One passive `pointerover` listener per window remembers it, held weakly so a closed view
 * is not kept alive; the pointer leaving the window forgets it. A window losing focus does not: the
 * GM presses a key on another device while the pointer rests where it was.
 */
export class HoveredElement {
  private hovered: WeakRef<Element> | null = null;
  private stop: (() => void) | null = null;

  constructor(private readonly workspace: Workspace) {}

  start(): void {
    if (this.stop) return;
    this.stop = followEveryDocument(this.workspace, (doc) => this.watch(doc));
  }

  /** Removes every listener and forgets the element. */
  dispose(): void {
    this.stop?.();
    this.stop = null;
    this.hovered = null;
  }

  /** The element last under the pointer, while it is still there. */
  element(): Element | null {
    return this.hovered?.deref() ?? null;
  }

  private watch(doc: Document): () => void {
    const over = (event: PointerEvent): void => {
      // An element of another window is no Element of this one, so the target is checked by shape
      const target = event.target as { closest?: unknown } | null;
      this.hovered = target && typeof target.closest === 'function' ? new WeakRef(target as Element) : null;
    };
    const left = (): void => {
      if (this.element()?.ownerDocument === doc) this.hovered = null;
    };
    doc.addEventListener('pointerover', over, { passive: true });
    doc.documentElement.addEventListener('pointerleave', left, { passive: true });
    return () => {
      doc.removeEventListener('pointerover', over);
      doc.documentElement.removeEventListener('pointerleave', left);
    };
  }
}
