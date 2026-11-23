/** Something one window holds, released with the window or with Atlas. */
export interface WindowPart {
  destroy(): void;
}

/** One part per window (the main one and every popout), made when first asked for and released when its window closes. */
export class PerWindow<T extends WindowPart> {
  private readonly parts = new Map<Document, { part: T; close: () => void }>();

  constructor(private readonly make: (doc: Document) => T) {}

  /** The part of `doc`'s window, if it has one yet. */
  peek(doc: Document): T | undefined {
    return this.parts.get(doc)?.part;
  }

  /** The part of `doc`'s window, made now where it has none. */
  in(doc: Document): T {
    const held = this.parts.get(doc);
    if (held) return held.part;
    const part = this.make(doc);
    const close = (): void => {
      part.destroy();
      this.parts.delete(doc);
    };
    doc.defaultView?.addEventListener('unload', close, { once: true });
    this.parts.set(doc, { part, close });
    return part;
  }

  destroy(): void {
    for (const [doc, { part, close }] of this.parts) {
      doc.defaultView?.removeEventListener('unload', close);
      part.destroy();
    }
    this.parts.clear();
  }
}
