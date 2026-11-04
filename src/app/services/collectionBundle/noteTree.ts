import type { BundleFile } from './bundleFormat';
import { noteName } from '../../utils/pathUtils';

/** Why a note is part of the collection: a scene opens it, or another note links to it. `more` counts the others that do. */
export interface NoteOrigin {
  kind: 'scene' | 'note';
  name: string;
  more: number;
}

export interface NoteEntry {
  path: string;
  name: string;
  /** 0 for a note a scene opens, one more for every link followed to reach the note. */
  depth: number;
  origin?: NoteOrigin;
  /** How many notes were found through this one. */
  linked?: number;
}

export { noteName };
const byName = (a: BundleFile, b: BundleFile): number => noteName(a.vaultPath).localeCompare(noteName(b.vaultPath), undefined, { numeric: true });

/**
 * The bundled notes as a tree in reading order: the notes scenes open, each
 * followed by the notes found through it. A note several notes link to stands
 * once, below the one nearest to a scene.
 */
export function noteTree(files: readonly BundleFile[], assetNames: ReadonlyMap<string, string>): NoteEntry[] {
  const notes = files.filter((file) => file.role === 'linked-note');
  const bundled = new Set(notes.map((note) => note.vaultPath));
  const linkers = (note: BundleFile): string[] => (note.linkedFrom ?? []).filter((path) => bundled.has(path));
  const scenes = (note: BundleFile): string[] => (note.owners ?? []).flatMap((id) => assetNames.get(id) ?? []);
  const listed = (lists: Map<string, BundleFile[]>, path: string): BundleFile[] => {
    const list = lists.get(path) ?? [];
    lists.set(path, list);
    return list;
  };
  const linkedBy = new Map<string, BundleFile[]>();
  for (const note of notes) {
    for (const path of linkers(note)) listed(linkedBy, path).push(note);
  }

  const roots = notes.filter((note) => scenes(note).length > 0 || linkers(note).length === 0);
  const placed = new Set(roots.map((root) => root.vaultPath));
  const children = new Map<string, BundleFile[]>();
  // Level by level, so every note hangs below the shortest way to it.
  const queue = [...roots];
  for (const note of queue) {
    for (const child of linkedBy.get(note.vaultPath) ?? []) {
      if (placed.has(child.vaultPath)) continue;
      placed.add(child.vaultPath);
      listed(children, note.vaultPath).push(child);
      queue.push(child);
    }
  }
  // Notes that only link to each other (a damaged bundle) are listed on their own.
  const unreached = notes.filter((note) => !placed.has(note.vaultPath));

  // A stack instead of recursion: a chain of daily notes is thousands of levels deep.
  const entries: NoteEntry[] = [];
  const parents: Array<NoteEntry | undefined> = [];
  const pending: Array<{ note: BundleFile; parent?: NoteEntry }> = [...roots, ...unreached].sort(byName).reverse().map((note) => ({ note }));
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { note, parent } = next;
    const sceneNames = scenes(note);
    const entry: NoteEntry = { path: note.vaultPath, name: noteName(note.vaultPath), depth: parent ? parent.depth + 1 : 0 };
    if (parent) entry.origin = { kind: 'note', name: parent.name, more: linkers(note).length - 1 };
    else if (sceneNames[0]) entry.origin = { kind: 'scene', name: sceneNames[0], more: sceneNames.length - 1 };
    entries.push(entry);
    parents.push(parent);
    for (const child of (children.get(note.vaultPath) ?? []).sort(byName).reverse()) pending.push({ note: child, parent: entry });
  }
  // A note stands before the notes below it, so counting from the end has every count ready for the note above.
  for (let index = entries.length - 1; index >= 0; index--) {
    const parent = parents[index];
    if (parent) parent.linked = (parent.linked ?? 0) + 1 + (entries[index]?.linked ?? 0);
  }
  return entries;
}
