import React from 'react';
import { act, render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';
import type { App } from 'obsidian';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import type { NoteSnapshot } from '../../../../src/app/statblocks/notes/noteSource';
import type { WriteOutcome } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import type { PaneServices } from '../../../../src/app/statblocks/editor/paneServices';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { StatblockPane } from '../../../../src/app/statblocks/editor/statblock-pane/StatblockPane';
import type { StatblockPaneActions, StatblockPaneProps } from '../../../../src/app/statblocks/editor/statblock-pane/paneTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

export const NOTE_PATH = 'Bestiary/Marsh Warden.md';

/** A note source over values the test sets; `set` tells the pane's watcher, as an edit in the note would. */
// Named, since a class implements a name: an indexed type there is a parsing error.
type PaneSource = PaneServices['source'];
type PaneWriter = PaneServices['writer'];

export class FakeSource implements PaneSource {
  private readonly snapshots = new Map<string, NoteSnapshot>();
  private readonly listeners = new Map<string, Set<(snapshot: NoteSnapshot) => void>>();

  read(path: string): NoteSnapshot {
    return this.snapshots.get(path) ?? { path, frontmatter: null, origin: 'none', problem: null };
  }

  watch(path: string, listener: (snapshot: NoteSnapshot) => void): () => void {
    const set = this.listeners.get(path) ?? new Set();
    set.add(listener);
    this.listeners.set(path, set);
    return () => set.delete(listener);
  }

  set(path: string, frontmatter: Record<string, unknown> | null, problem: NoteSnapshot['problem'] = null): void {
    this.tell({ path, frontmatter, origin: 'buffer', problem });
  }

  /** The note is gone, as the source reads a deleted note. */
  remove(path: string): void {
    this.tell({ path, frontmatter: null, origin: 'none', problem: null });
  }

  private tell(snapshot: NoteSnapshot): void {
    this.snapshots.set(snapshot.path, snapshot);
    for (const listener of this.listeners.get(snapshot.path) ?? []) listener(snapshot);
  }
}

/** A writer that records every write and answers with `answer` (everything applied, by default). */
export class FakeWriter implements PaneWriter {
  readonly writes: Array<{ path: string; patches: readonly NotePatch[] }> = [];
  answer: (patches: readonly NotePatch[]) => WriteOutcome = (patches) => ({ applied: [...patches], conflicts: [], backend: 'editor', problem: null });
  readonly flush = vi.fn(async (): Promise<void> => undefined);
  readonly undo = vi.fn((): boolean => true);
  readonly redo = vi.fn((): boolean => true);
  /** The commits registered for the writer's last flush. */
  readonly pending = new Set<() => Promise<void>>();

  registerPending(commit: () => Promise<void>): () => void {
    this.pending.add(commit);
    return () => { this.pending.delete(commit); };
  }

  write(path: string, patches: readonly NotePatch[]): Promise<WriteOutcome> {
    this.writes.push({ path, patches });
    return Promise.resolve(this.answer(patches));
  }

  /** Every patch written so far, in order. */
  patches(): NotePatch[] {
    return this.writes.flatMap((write) => write.patches);
  }
}

export interface PaneHarness {
  app: App;
  source: FakeSource;
  writer: FakeWriter;
  actions: StatblockPaneActions;
  result: RenderResult;
  rerender: (props?: Partial<StatblockPaneProps>) => void;
}

export interface PaneOptions extends Partial<StatblockPaneProps> {
  frontmatter?: Record<string, unknown> | null;
  problem?: NoteSnapshot['problem'];
  /** Vault path → text; the note itself by default. */
  files?: Record<string, string>;
  /** Where the pane is drawn: another window's element (a popout), else the page's own. */
  container?: HTMLElement;
}

/** Renders the pane over a note whose values the fake source holds; the vault holds the note. */
export async function renderPane(options: PaneOptions = {}): Promise<PaneHarness> {
  const { app } = createInMemoryApp({ files: options.files ?? { [NOTE_PATH]: '---\nstatblock: true\n---\n' } });
  const source = new FakeSource();
  const writer = new FakeWriter();
  if (options.frontmatter !== undefined) source.set(NOTE_PATH, options.frontmatter, options.problem ?? null);
  const actions: StatblockPaneActions = {
    showProperties: vi.fn(),
    changeCollection: vi.fn(),
    ...options.actions,
  };
  const { container: _container, ...paneOptions } = options;
  const props = (extra: Partial<StatblockPaneProps> = {}): StatblockPaneProps => ({
    app,
    services: { source, writer },
    notePath: NOTE_PATH,
    collectionId: 'campaign',
    propertiesShown: false,
    announcement: '',
    focusRequest: 0,
    pendingCommit: { current: null },
    ...paneOptions,
    actions,
    ...extra,
  });
  const tree = (extra?: Partial<StatblockPaneProps>): React.JSX.Element => (
    <TooltipProvider><SurfaceMenuProvider ownerId="pane"><StatblockPane {...props(extra)} /></SurfaceMenuProvider></TooltipProvider>
  );
  let result!: RenderResult;
  await act(async () => {
    result = options.container ? render(tree(), { container: options.container, baseElement: options.container.ownerDocument.body }) : render(tree());
  });
  // The library and the collection context settle in microtasks.
  await act(async () => { await Promise.resolve(); });
  return { app, source, writer, actions, result, rerender: (extra) => result.rerender(tree(extra)) };
}

/** The element of a block of the card. */
export function blockOf(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
  if (!el) throw new Error(`No block ${id}`);
  return el;
}
