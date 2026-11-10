import { useEffect, useRef, useState } from 'react';
import { TFile, type App } from 'obsidian';
import type { TemplateId } from '../../model/templateTypes';
import type { NoteSnapshot } from '../../notes/noteSource';
import { frontmatterSource, statblockSourceOf, type FrontmatterRecord } from '../../notes/statblockSource';
import type { PaneServices } from '../paneServices';
import type { PaneNoteKind } from './paneTypes';

export interface PaneNote {
  snapshot: NoteSnapshot;
  kind: PaneNoteKind;
  /** The template a native statblock names. */
  templateId: TemplateId | null;
  /** The note's values: what it holds now, or, once deleted, what it held last. */
  record: FrontmatterRecord;
}

const NO_VALUES: FrontmatterRecord = {};

/** The note's snapshot from the source: read at once, then every time the source hears of a change. */
function useSnapshot(source: PaneServices['source'], path: string): NoteSnapshot {
  const [snapshot, setSnapshot] = useState(() => source.read(path));
  useEffect(() => {
    setSnapshot(source.read(path));
    return source.watch(path, setSnapshot);
  }, [source, path]);
  return snapshot;
}

/** What the frontmatter alone cannot tell: whether the body holds a ```statblock fence. */
function useFenceCheck(app: App, path: string, needed: boolean): 'checking' | 'fence' | 'none' {
  const [answer, setAnswer] = useState<{ path: string; fence: boolean } | null>(null);
  useEffect(() => {
    if (!needed) return undefined;
    let cancelled = false;
    const file = app.vault.getAbstractFileByPath(path);
    const check = file instanceof TFile ? statblockSourceOf(app, file) : Promise.resolve(null);
    check.then(
      (source) => { if (!cancelled) setAnswer({ path, fence: source?.kind === 'fs-fence' }); },
      () => { if (!cancelled) setAnswer({ path, fence: false }); },
    );
    return () => { cancelled = true; };
  }, [app, path, needed]);
  if (answer?.path !== path) return 'checking';
  return answer.fence ? 'fence' : 'none';
}

function kindOf(snapshot: NoteSnapshot, exists: boolean, fence: 'checking' | 'fence' | 'none'): PaneNoteKind {
  if (!exists) return 'deleted';
  if (snapshot.problem) return 'unreadable';
  if (snapshot.origin === 'none') return 'loading';
  const source = frontmatterSource(snapshot.frontmatter);
  if (source?.kind === 'atlas') return 'atlas';
  if (source) return 'fantasy';
  return fence === 'checking' ? 'loading' : fence === 'fence' ? 'fantasy' : 'none';
}

/**
 * The pane's note as the source reads it (§8.2): its values, and what kind of
 * statblock it is, which decides what the pane offers. Reading never writes.
 */
export function usePaneNote(app: App, services: PaneServices, path: string): PaneNote {
  const snapshot = useSnapshot(services.source, path);
  const exists = app.vault.getAbstractFileByPath(path) !== null;
  const source = frontmatterSource(snapshot.frontmatter);
  const fence = useFenceCheck(app, path, exists && !snapshot.problem && snapshot.origin !== 'none' && source === null);
  const kind = kindOf(snapshot, exists, fence);
  const last = useRef<FrontmatterRecord>(NO_VALUES);
  useEffect(() => {
    if (snapshot.frontmatter) last.current = snapshot.frontmatter;
  }, [snapshot]);
  const record = kind === 'deleted' ? last.current : snapshot.frontmatter ?? NO_VALUES;
  // A deleted note keeps the template it was drawn with, as it keeps its values.
  const drawnWith = kind === 'deleted' ? frontmatterSource(record) : source;
  return { snapshot, kind, templateId: drawnWith?.kind === 'atlas' ? drawnWith.templateId : null, record };
}
