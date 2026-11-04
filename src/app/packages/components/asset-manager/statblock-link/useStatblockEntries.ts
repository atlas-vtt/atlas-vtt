import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { BESTIARY_SETTLE_MS } from '../../../../creatures/CreatureIndex';
import { bestiaryLookup } from '../../../../creatures/linkedCreature';
import { useBestiaryRevision } from '../../../../react/hooks/useBestiaryRevision';
import { sortedEntries, statblockEntries, type StatblockEntry } from './statblockEntries';
import { isNativeCreature, statblockNoteEntries, type NoteEntry } from './statblockNoteEntries';

export type BestiaryStatus = 'missing' | 'loading' | 'ready';

export interface StatblockEntries {
  entries: StatblockEntry[];
  status: BestiaryStatus;
}

/**
 * The linkable statblocks: Fantasy Statblocks' note-backed bestiary entries at
 * once, and the notes it does not describe (native statblocks, ```statblock
 * fences, unparsed frontmatter) once the vault is read; without the plugin,
 * only the latter. Both are kept current while the bestiary (re)parses; the
 * vault is read again once its updates settle, and a superseded read stops.
 * `missing`: the plugin is missing and the vault holds no statblock it can list.
 */
export function useStatblockEntries(app: App): StatblockEntries {
  const revision = useBestiaryRevision(app, BESTIARY_SETTLE_MS);
  // `revision` is not read here; it re-reads the bestiary whenever it changes.
  const bestiary = useMemo(() => bestiaryLookup(), [revision]);
  // The previous read stays listed while the vault is read again.
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void statblockNoteEntries(app, bestiary, controller.signal)
      .then((entries) => { if (!controller.signal.aborted) setNotes(entries); })
      .catch((error: unknown) => {
        console.error('[StatblockLink] Could not read the statblock notes:', error);
        if (!controller.signal.aborted) setNotes([]);
      });
    return () => controller.abort();
  }, [app, bestiary]);

  return useMemo((): StatblockEntries => {
    const { api, byPath } = bestiary;
    const byNote = new Map<string, StatblockEntry>();
    for (const entry of statblockEntries([...byPath.values()].filter((creature) => !isNativeCreature(creature)))) byNote.set(entry.path, entry);
    // A previous read may list a note the bestiary has parsed since; a native statblock is read from its note.
    for (const entry of notes ?? []) if (entry.native || !byNote.has(entry.path)) byNote.set(entry.path, entry);
    const entries = sortedEntries(byNote.values());
    if (entries.length > 0) return { entries, status: 'ready' };
    // The bestiary is parsed asynchronously at startup: empty and unresolved means "not ready yet".
    if (notes === null || (api && !api.isResolved?.())) return { entries, status: 'loading' };
    return { entries, status: api ? 'ready' : 'missing' };
  }, [bestiary, notes]);
}
