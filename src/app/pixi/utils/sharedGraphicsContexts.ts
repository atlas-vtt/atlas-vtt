import { GraphicsContext } from 'pixi.js';

interface Entry {
  readonly context: GraphicsContext;
  users: number;
}

/**
 * One GraphicsContext per drawing that many Graphics show alike. PIXI builds a context's geometry
 * once however many Graphics show it, so a shape hundreds of things show at once (the highlight of
 * every selected token) is built once and each Graphics only places it. The contexts batch as
 * `batched` makes a Graphics batch.
 */
export class SharedGraphicsContexts {
  private readonly entries = new Map<string, Entry>();

  /** The context of `key`, drawn by `draw` when no one holds it yet; held until `release(key)`. */
  acquire(key: string, draw: (context: GraphicsContext) => void): GraphicsContext {
    let entry = this.entries.get(key);
    if (!entry) {
      const context = new GraphicsContext();
      context.batchMode = 'batch';
      draw(context);
      entry = { context, users: 0 };
      this.entries.set(key, entry);
    }
    entry.users++;
    return entry.context;
  }

  /** Lets go of `key`'s context; the last one to let go destroys it. */
  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry || --entry.users > 0) return;
    this.entries.delete(key);
    entry.context.destroy();
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.context.destroy();
    this.entries.clear();
  }
}
