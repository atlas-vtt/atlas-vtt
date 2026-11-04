import type { App, TFile } from 'obsidian';
import { renderThumbnail } from '../../../../imageProcessing/imageProcessing';

/** Sharp in a card of the grid on high-density screens; cards are about 130 to 200px wide. */
const THUMBNAIL = { size: 384, quality: 0.8 };

/**
 * Small thumbnails of vault images, made in the image workers on demand. A
 * vault image may be a map of hundreds of megapixels, which an `<img>` would
 * decode whole for one card. `dispose` stops what is still being made and
 * gives every thumbnail back.
 */
export class VaultImageThumbnails {
  private readonly controller = new AbortController();
  private readonly made = new Map<string, Promise<string | null>>();

  constructor(private readonly app: App) {}

  /** The thumbnail's URL, or null when the image cannot be read. */
  load(file: TFile): Promise<string | null> {
    const key = `${file.path}|${file.stat.mtime}`;
    let thumbnail = this.made.get(key);
    if (!thumbnail) {
      thumbnail = this.make(file);
      this.made.set(key, thumbnail);
    }
    return thumbnail;
  }

  dispose(): void {
    this.controller.abort();
    for (const thumbnail of this.made.values()) void thumbnail.then((url) => { if (url) URL.revokeObjectURL(url); });
    this.made.clear();
  }

  private async make(file: TFile): Promise<string | null> {
    const { signal } = this.controller;
    try {
      const bytes = await this.app.vault.readBinary(file);
      if (signal.aborted) return null;
      const webp = await renderThumbnail(new Blob([bytes]), THUMBNAIL, { signal, background: true });
      return signal.aborted ? null : URL.createObjectURL(new Blob([webp], { type: 'image/webp' }));
    } catch {
      return null;
    }
  }
}
