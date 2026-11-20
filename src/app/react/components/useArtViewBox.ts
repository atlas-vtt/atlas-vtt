import { useEffect, useState } from 'react';
import type { App, TAbstractFile } from 'obsidian';
import { artInsetOf } from '../../initiative/art/artInset';
import { artViewBox } from '../../initiative/art/opaqueInset';

/**
 * The `object-view-box` that frames a card's art without the transparent margins of its image (`artInsetOf`), or
 * undefined while it is measured and where there is nothing to trim. Measured again when the file is written anew (art
 * cropped again in place) or arrives (a sync tool delivering it after the scene).
 */
export function useArtViewBox(app: App | null | undefined, imagePath: string | undefined): string | undefined {
  const [viewBox, setViewBox] = useState<{ path: string; box: string | undefined } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!app || !imagePath) return undefined;
    const changed = (file: TAbstractFile): void => {
      if (file.path === imagePath) setVersion((previous) => previous + 1);
    };
    const refs = [app.vault.on('create', changed), app.vault.on('modify', changed)];
    return () => refs.forEach((ref) => app.vault.offref(ref));
  }, [app, imagePath]);

  useEffect(() => {
    if (!app || !imagePath) return undefined;
    let current = true;
    void artInsetOf(app, imagePath).then((inset) => {
      if (current) setViewBox({ path: imagePath, box: inset ? artViewBox(inset) : undefined });
    });
    return () => {
      current = false;
    };
  }, [app, imagePath, version]);

  return viewBox !== null && viewBox.path === imagePath ? viewBox.box : undefined;
}
