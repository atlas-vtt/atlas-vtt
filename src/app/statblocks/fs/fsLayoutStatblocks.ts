/**
 * Every statblock a Fantasy Statblocks layout draws (§6.4), of both kinds:
 * frontmatter statblocks (`fsLayoutNotes.ts`) and notes holding a
 * ```statblock fence (`fsFenceNotes.ts`). A fence is drawn with the layout its
 * `layout:` names, else the plugin's default, read as a frontmatter's is.
 */

import type { App } from 'obsidian';
import type { LayoutIdentity } from './fsImport';
import { fenceNotes, type FenceParams } from './fsFenceNotes';
import { BY_PATH, frontmatterStatblocks, noteLayoutReader, notesUsingLayout, sameLayout } from './fsLayoutNotes';

/** A layout's statblocks by kind, each list by path. */
export interface LayoutStatblocks {
  /** Frontmatter statblocks: they take the template in place. */
  frontmatter: string[];
  /** Notes holding a statblock fence drawn with the layout: the fence moves into the note's properties. */
  fences: string[];
}

export interface LayoutGroup {
  layout: LayoutIdentity;
  statblocks: LayoutStatblocks;
}

export const NO_STATBLOCKS: LayoutStatblocks = { frontmatter: [], fences: [] };

export function statblockCount(statblocks: LayoutStatblocks): number {
  return statblocks.frontmatter.length + statblocks.fences.length;
}

/** The statblocks without one note (the pane's own, which took the template already). */
export function withoutNote(statblocks: LayoutStatblocks, path: string | undefined): LayoutStatblocks {
  if (path === undefined) return statblocks;
  return { frontmatter: statblocks.frontmatter.filter((each) => each !== path), fences: statblocks.fences.filter((each) => each !== path) };
}

type LayoutReader = ReturnType<typeof noteLayoutReader>;

/** The layouts a note's fences are drawn with, each once. */
function fenceLayouts(read: LayoutReader, fences: FenceParams): LayoutIdentity[] {
  const layouts: LayoutIdentity[] = [];
  for (const params of fences) {
    const layout = read(params ?? {});
    if (layout && !layouts.some((known) => sameLayout(known, layout))) layouts.push(layout);
  }
  return layouts;
}

/** The statblocks among `paths` (every note when absent) that the layout draws. */
export async function statblocksUsingLayout(app: App, layout: LayoutIdentity, paths?: readonly string[], signal?: AbortSignal): Promise<LayoutStatblocks> {
  const read = noteLayoutReader(app);
  const fences = (await fenceNotes(app, paths, signal))
    .filter((note) => fenceLayouts(read, note.fences).some((each) => sameLayout(each, layout)))
    .map((note) => note.path)
    .sort((a, b) => BY_PATH.compare(a, b));
  return { frontmatter: notesUsingLayout(app, layout, paths), fences };
}

/** The layouts that draw the statblocks among `paths` (every note when absent), each with its statblocks, the most used first. */
export async function layoutGroupsOfNotes(app: App, paths?: readonly string[], signal?: AbortSignal): Promise<LayoutGroup[]> {
  const read = noteLayoutReader(app);
  const unique = paths ? [...new Set(paths)] : undefined;
  const groups: LayoutGroup[] = [];
  const add = (layout: LayoutIdentity, kind: keyof LayoutStatblocks, path: string): void => {
    const group = groups.find((candidate) => sameLayout(candidate.layout, layout));
    if (group) group.statblocks[kind].push(path);
    else groups.push({ layout, statblocks: { frontmatter: [], fences: [], [kind]: [path] } });
  };
  for (const { path, frontmatter } of frontmatterStatblocks(app, unique)) {
    const layout = read(frontmatter);
    if (layout) add(layout, 'frontmatter', path);
  }
  for (const note of await fenceNotes(app, unique, signal)) {
    for (const layout of fenceLayouts(read, note.fences)) add(layout, 'fences', note.path);
  }
  for (const { statblocks } of groups) {
    statblocks.frontmatter.sort((a, b) => BY_PATH.compare(a, b));
    statblocks.fences.sort((a, b) => BY_PATH.compare(a, b));
  }
  return groups.sort((a, b) => statblockCount(b.statblocks) - statblockCount(a.statblocks) || BY_PATH.compare(a.layout.name, b.layout.name));
}
