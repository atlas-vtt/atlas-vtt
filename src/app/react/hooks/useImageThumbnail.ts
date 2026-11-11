import { useEffect, useState, type RefObject } from 'react';
import type { App, TFile } from 'obsidian';
import { optimizeImage } from '../../imageProcessing/imageProcessing';

/** A small copy of a vault picture: decoded in the image workers, never the full image on the main thread. */
const THUMBNAIL = { maxWidth: 128, maxHeight: 128, quality: 0.75 };
/** Thumbnails kept between pickers; the oldest give way. */
const MAX_CACHED = 200;
const cache = new Map<string, string>();

export type ThumbnailState = { url: string } | 'pending' | 'failed';

function remember(key: string, url: string): string {
  cache.set(key, url);
  for (const [oldKey, oldUrl] of cache) {
    if (cache.size <= MAX_CACHED) break;
    cache.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

/** A thumbnail of `file`, made once `target` scrolls into view, kept for later pickers. */
export function useImageThumbnail(app: App, file: TFile, target: RefObject<Element | null>): ThumbnailState {
  const key = `${file.path}@${file.stat.mtime}`;
  const cached = cache.get(key);
  const [state, setState] = useState<ThumbnailState>(cached ? { url: cached } : 'pending');

  useEffect(() => {
    const known = cache.get(key);
    if (known) { setState({ url: known }); return; }
    const abort = new AbortController();
    const make = async (): Promise<void> => {
      try {
        const bytes = await app.vault.readBinary(file);
        // Workers cannot decode an SVG; the type sends it to the main thread's rasterizer
        const source = new Blob([bytes], file.extension.toLowerCase() === 'svg' ? { type: 'image/svg+xml' } : {});
        const { image } = await optimizeImage(source, THUMBNAIL, { signal: abort.signal, background: true });
        const url = remember(key, URL.createObjectURL(image));
        if (!abort.signal.aborted) setState({ url });
      } catch {
        if (!abort.signal.aborted) setState('failed');
      }
    };
    const element = target.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      void make();
      return () => abort.abort();
    }
    const observer = new IntersectionObserver((records) => {
      if (!records.some((record) => record.isIntersecting)) return;
      observer.disconnect();
      void make();
    });
    observer.observe(element);
    return () => { observer.disconnect(); abort.abort(); };
  }, [app, file, key, target]);

  return state;
}
