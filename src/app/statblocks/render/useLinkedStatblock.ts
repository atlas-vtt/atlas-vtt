import { useEffect, useMemo, useReducer, useState } from 'react';
import { TFile, type App } from 'obsidian';
import { TemplateLibrary } from '../library/TemplateLibrary';
import type { LibraryTemplate, ResolvedStatblock, StatblockSource } from '../model/resolvedTypes';
import type { TemplateId } from '../model/templateTypes';
import { cachedTemplateId, statblockSourceFromText, statblockSourceOf } from '../notes/statblockSource';
import { libraryTemplates } from '../resolve/readStatblock';
import { resolveStatblock } from '../resolve/resolveStatblock';
import { resolveStatblockText } from '../resolve/resolveStatblockText';

/** The note a statblock is shown from: a vault note, or note text that is not in the vault. */
export interface LinkedNote {
  path: string;
  /** The note's text when it is not in the vault (a bundle under review); `path` then names it. */
  text?: string | undefined;
  /** Templates that travel with `text` (the bundle's own), found before the library's. */
  bundleTemplates?: readonly LibraryTemplate[] | undefined;
}

/** What a note shows: its statblock, or why there is none to draw. */
export type LinkedStatblockResult =
  | { kind: 'statblock'; statblock: ResolvedStatblock }
  /** `fence`: a fence Atlas cannot read, one that names a bestiary creature or another note. */
  | { kind: 'none'; fence: boolean }
  | { kind: 'unreadable' };

export interface LinkedStatblockState {
  /** Until the note has been read; `result` meanwhile holds the previous note's, or null. */
  loading: boolean;
  result: LinkedStatblockResult | null;
}

interface Settled {
  note: LinkedNote;
  result: LinkedStatblockResult;
}

const templateIdOf = (source: StatblockSource | null): TemplateId | null => (source?.kind === 'atlas' ? source.templateId : null);

/** Calls `onChange` whenever the metadata cache reads the note at `path` anew. */
function useNoteChanges(app: App, path: string | null, onChange: () => void): void {
  useEffect(() => {
    if (path === null) return undefined;
    const ref = app.metadataCache.on('changed', (file) => {
      if (file.path === path) onChange();
    });
    return () => app.metadataCache.offref(ref);
  }, [app, path, onChange]);
}

/**
 * The template id a native note names, read without waiting: from the
 * metadata cache, or from the note's text; null for every other note. Read
 * again whenever the metadata cache reads the note anew, so a note switched
 * to another template, or adopted, is followed with it.
 */
export function useNativeTemplateId(app: App, path: string, text: string | undefined): TemplateId | null {
  const [, noteChanged] = useReducer((count: number): number => count + 1, 0);
  useNoteChanges(app, text === undefined ? path : null, noteChanged);
  const fromText = useMemo(() => (text === undefined ? undefined : templateIdOf(statblockSourceFromText(text))), [text]);
  if (fromText !== undefined) return fromText;
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? cachedTemplateId(app, file) : null;
}

async function readLinked(app: App, note: LinkedNote): Promise<LinkedStatblockResult> {
  const templates = libraryTemplates(app);
  if (note.text !== undefined) {
    const context = { app, templates, ...(note.bundleTemplates ? { bundleTemplates: note.bundleTemplates } : {}) };
    const statblock = await resolveStatblockText(note.text, note.path, context);
    if (statblock) return { kind: 'statblock', statblock };
    return { kind: 'none', fence: statblockSourceFromText(note.text)?.kind === 'fs-fence' };
  }

  const statblock = await resolveStatblock(app, note.path, { templates });
  if (statblock) return { kind: 'statblock', statblock };
  const file = app.vault.getAbstractFileByPath(note.path);
  const source = file instanceof TFile ? await statblockSourceOf(app, file) : null;
  return { kind: 'none', fence: source?.kind === 'fs-fence' };
}

/** Calls `onChange` when the library's entry for `templateId` changes (a save of the template too), or its first load ends. */
function useTemplateChanges(app: App, templateId: TemplateId | null, onChange: () => void): void {
  useEffect(() => {
    if (templateId === null) return undefined;
    const library = TemplateLibrary.forApp(app);
    let entry = library.get(templateId);
    let loading = library.isLoading();
    return library.subscribe(() => {
      const nextEntry = library.get(templateId);
      const nextLoading = library.isLoading();
      if (nextEntry === entry && nextLoading === loading) return;
      entry = nextEntry;
      loading = nextLoading;
      onChange();
    });
  }, [app, templateId, onChange]);
}

/** A native note found no template while the library still reads its files: it may yet. */
function awaitsLibrary(app: App, result: LinkedStatblockResult | null): boolean {
  return result?.kind === 'statblock'
    && result.statblock.source.kind === 'atlas'
    && result.statblock.templateStatus === 'missing'
    && TemplateLibrary.forApp(app).isLoading();
}

/**
 * Reads a note's statblock through the one resolver and reads it again when
 * the note changes (`metadataCache` 'changed') or, for a native note, when
 * its template does. While a new note is read the previous note's statblock
 * stays, so the caller decides when a skeleton shows.
 */
export function useLinkedStatblock(app: App, note: LinkedNote, templateId: TemplateId | null): LinkedStatblockState {
  const { path, text, bundleTemplates } = note;
  const [revision, refresh] = useReducer((count: number): number => count + 1, 0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const current = useMemo((): LinkedNote => ({ path, text, bundleTemplates }), [path, text, bundleTemplates]);

  useNoteChanges(app, text === undefined ? path : null, refresh);
  useTemplateChanges(app, templateId, refresh);

  useEffect(() => {
    let cancelled = false;
    readLinked(app, current).then(
      (result) => { if (!cancelled) setSettled({ note: current, result }); },
      (error: unknown) => {
        console.error(`[Atlas] Reading the statblock of ${current.path} failed:`, error);
        if (!cancelled) setSettled({ note: current, result: { kind: 'unreadable' } });
      },
    );
    return () => { cancelled = true; };
  }, [app, current, revision]);

  const result = settled?.result ?? null;
  return { loading: settled?.note !== current || awaitsLibrary(app, result), result };
}
