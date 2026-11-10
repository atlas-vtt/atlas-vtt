import { useEffect, useState } from 'react';
import type { App, EventRef } from 'obsidian';
import { templateNoteCounts } from '../library/templateUsage';
import type { TemplateId } from '../model/templateTypes';

/** Notes change often while typing; the counts follow once the metadata settles. */
const SETTLE_MS = 500;

function sameCounts(a: ReadonlyMap<TemplateId, number>, b: ReadonlyMap<TemplateId, number>): boolean {
  return a.size === b.size && [...a].every(([id, count]) => b.get(id) === count);
}

/** How many statblocks name each template, read again whenever the metadata cache changes. */
export function useTemplateNoteCounts(app: App): ReadonlyMap<TemplateId, number> {
  const [counts, setCounts] = useState<ReadonlyMap<TemplateId, number>>(() => templateNoteCounts(app));
  useEffect(() => {
    const read = (): void => {
      const next = templateNoteCounts(app);
      setCounts((previous) => (sameCounts(previous, next) ? previous : next));
    };
    read();
    let timer = 0;
    const later = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, SETTLE_MS);
    };
    const cacheRefs: EventRef[] = [app.metadataCache.on('changed', later), app.metadataCache.on('deleted', later)];
    const renameRef = app.vault.on('rename', later);
    return () => {
      window.clearTimeout(timer);
      cacheRefs.forEach((ref) => app.metadataCache.offref(ref));
      app.vault.offref(renameRef);
    };
  }, [app]);
  return counts;
}
