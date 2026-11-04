import { vi } from 'vitest';
import { TFile, type App } from 'obsidian';

type Listener = (...args: unknown[]) => unknown;

interface ViewState {
  type: string;
  state?: Record<string, unknown>;
}

/** A workspace leaf with the public calls opening a note uses: view state and files. */
export class FakeLeaf {
  eState: unknown = undefined;
  readonly containerEl = document.createElement('div');
  readonly openFile = vi.fn(async (file: TFile) => {
    this.viewState = { type: 'markdown', state: { file: file.path } };
  });
  readonly setViewState = vi.fn(async (viewState: ViewState, eState?: unknown) => {
    this.viewState = viewState;
    this.eState = eState;
  });
  readonly loadIfDeferred = vi.fn(async () => undefined);

  constructor(public viewState: ViewState = { type: 'empty' }, public app: App | null = null) {}

  getViewState(): ViewState {
    return this.viewState;
  }
}

/** The leaf showing a note. */
export const noteLeaf = (path: string): FakeLeaf => new FakeLeaf({ type: 'markdown', state: { file: path } });

export interface FakeWorkspace {
  leaves: FakeLeaf[];
  current: FakeLeaf | null;
  workspace: Record<string, unknown>;
  /** Fires a workspace event, as Obsidian would. */
  trigger: (name: string, ...args: unknown[]) => void;
}

/** A workspace over `leaves`: splits and new tabs add a leaf, events can be fired. */
export function fakeWorkspace(leaves: FakeLeaf[], current: FakeLeaf | null): FakeWorkspace {
  const listeners = new Map<string, Set<Listener>>();
  const fake: FakeWorkspace = {
    leaves,
    current,
    trigger: (name, ...args) => {
      for (const listener of listeners.get(name) ?? []) listener(...args);
    },
    workspace: {},
  };
  const created = (): FakeLeaf => {
    const leaf = new FakeLeaf();
    fake.leaves.push(leaf);
    return leaf;
  };
  fake.workspace = {
    iterateAllLeaves: (callback: (leaf: FakeLeaf) => unknown) => {
      for (const leaf of fake.leaves) callback(leaf);
    },
    getMostRecentLeaf: () => fake.current,
    createLeafBySplit: vi.fn(() => created()),
    getLeaf: vi.fn(() => created()),
    setActiveLeaf: vi.fn(),
    requestSaveLayout: vi.fn(),
    on: (name: string, listener: Listener) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return { name, listener };
    },
    offref: (ref: { name: string; listener: Listener }) => listeners.get(ref.name)?.delete(ref.listener),
    onLayoutReady: (callback: () => void) => callback(),
  };
  return fake;
}

/** Makes `path` a note of the app's vault. */
export function withNote(app: App, path: string): void {
  const vault = app.vault as unknown as Record<string, unknown>;
  const previous = vault.getAbstractFileByPath as ((candidate: string) => unknown) | undefined;
  vault.getAbstractFileByPath = (candidate: string) => (candidate === path ? new TFile(path) : previous?.(candidate) ?? null);
}
