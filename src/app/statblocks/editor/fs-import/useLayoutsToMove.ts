import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { findImportedTemplate, identityOf, type FsLayoutImport, type LayoutIdentity } from '../../fs/fsImport';
import { layoutGroupsOfNotes, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import { sameLayout } from '../../fs/fsLayoutNotes';
import type { FsLayout } from '../../fs/fsLayoutTypes';
import type { LibraryTemplate } from '../../model/resolvedTypes';

/** A layout imported before whose statblocks are not all moved to Atlas yet. */
export interface LayoutToMove {
  layout: LayoutIdentity;
  imported: FsLayoutImport;
  statblocks: LayoutStatblocks;
}

/** The template a layout was imported as, as the batch names it; null for a built-in or one not imported. */
export function importedAs(templates: readonly LibraryTemplate[], layout: LayoutIdentity): FsLayoutImport | null {
  const entry = findImportedTemplate(templates, layout);
  return entry?.path ? { id: entry.template.id, name: entry.name, path: entry.path, report: null } : null;
}

/**
 * The layouts among `layouts` that were imported before and still draw
 * statblocks to move, by layout id; empty while the vault is read (in slices)
 * and while `templates` is null.
 */
export function useLayoutsToMove(app: App, layouts: readonly FsLayout[], templates: readonly LibraryTemplate[] | null): ReadonlyMap<string, LayoutToMove> {
  const [found, setFound] = useState<ReadonlyMap<string, LayoutToMove>>(new Map());
  useEffect(() => {
    const imports = templates
      ? layouts.flatMap((layout) => {
        const identity = identityOf(layout);
        const imported = importedAs(templates, identity);
        return imported ? [{ id: layout.id, layout: identity, imported }] : [];
      })
      : [];
    if (imports.length === 0) {
      setFound(new Map());
      return undefined;
    }
    const abort = new AbortController();
    layoutGroupsOfNotes(app, undefined, abort.signal).then(
      (groups) => {
        if (abort.signal.aborted) return;
        const next = new Map<string, LayoutToMove>();
        for (const { id, layout, imported } of imports) {
          const group = groups.find((candidate) => sameLayout(candidate.layout, layout));
          if (group) next.set(id, { layout, imported, statblocks: group.statblocks });
        }
        setFound(next);
      },
      (error: unknown) => { console.error('[Atlas] Counting the statblocks of Fantasy Statblocks layouts failed:', error); },
    );
    return () => abort.abort();
  }, [app, layouts, templates]);
  return found;
}
