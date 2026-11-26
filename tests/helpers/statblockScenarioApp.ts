import { vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { frontmatterOfText } from '../../src/app/statblocks/notes/statblockSource';
import type { StatblockLayout } from '../../src/app/react/components/statblock/statblockTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { TOKEN_ART, type StatblockScenario } from '../fixtures/gmScreenStatblockNotes';

type Listener = (...data: unknown[]) => unknown;

/** Where the test's vault lies on disk. */
const VAULT_FOLDER = '/home/gm/Vaults/Marsh Campaign';

export interface ScenarioApp {
  readonly app: App;
  readonly files: Map<string, string>;
  /** Writes a note's text and tells the metadata cache's listeners, as Obsidian does after an edit. */
  edit(path: string, text: string): void;
  /** Ends Fantasy Statblocks' parse of the vault, for a vault that was made while it parses (`parsing`), as the plugin announces it. */
  resolveBestiary(): void;
  /** Removes the Fantasy Statblocks global again. */
  dispose(): void;
}

/** Fantasy Statblocks as the plugin exposes it once its bestiary is parsed: its API on `window` and its layout manager. */
function installFantasyStatblocks(app: App, layouts: readonly StatblockLayout[], creatures: () => readonly Record<string, unknown>[], resolved: () => boolean): void {
  const named = (name: string): Record<string, unknown> | null => creatures().find((creature) => creature.name === name) ?? null;
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures: () => creatures(),
      getBestiaryNames: () => creatures().map((creature) => creature.name),
      hasCreature: (name: string) => named(name) !== null,
      getCreatureFromBestiary: named,
      isResolved: resolved,
      onResolved: () => undefined,
      onUpdated: () => undefined,
      render: () => ({ unload: () => undefined }),
    },
  });
  const [first] = layouts;
  Object.assign(app, {
    plugins: {
      plugins: {
        'obsidian-5e-statblocks': {
          manager: {
            getAllLayouts: () => [...layouts],
            getLayout: (id: string) => layouts.find((layout) => layout.id === id) ?? null,
            getDefaultLayout: () => first,
          },
        },
      },
    },
  });
}

/**
 * A vault holding a scenario's statblock note and its token's art, whose metadata cache reads the notes'
 * frontmatter, with Fantasy Statblocks installed where the scenario has it. `art` is the token art's bytes.
 */
export function scenarioApp(scenarios: readonly StatblockScenario[], art: ArrayBuffer = new ArrayBuffer(8), parsing = false): ScenarioApp {
  const { app, files } = createInMemoryApp({ files: Object.fromEntries(scenarios.map((scenario) => [scenario.path, scenario.note])) });
  void app.vault.createBinary(TOKEN_ART, art);
  // A file's address as Obsidian's desktop app gives it: the vault's folder on disk, the path encoded, the file's time.
  Object.assign(app.vault.adapter, { getFullPath: (path: string) => `${VAULT_FOLDER}/${path}` });
  vi.mocked(app.vault.getResourcePath).mockImplementation((file: TFile) => `app://0b1f5e/${encodeURI(`${VAULT_FOLDER}/${file.path}`.slice(1))}?1700000000000`);
  const listeners = new Map<string, Set<Listener>>();
  Object.assign(app.metadataCache, {
    on: (name: string, callback: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
      return { name, callback };
    },
    offref: (ref: { name: string; callback: Listener }) => void listeners.get(ref.name)?.delete(ref.callback),
    getFileCache: (file: TFile) => {
      const frontmatter = frontmatterOfText(files.get(file.path) ?? '');
      return frontmatter ? { frontmatter } : null;
    },
  });
  const workspace = new Map<string, Set<Listener>>();
  Object.assign(app.workspace, {
    on: (name: string, callback: Listener) => {
      if (!workspace.has(name)) workspace.set(name, new Set());
      workspace.get(name)!.add(callback);
      return { name, callback };
    },
    offref: (ref: { name: string; callback: Listener }) => void workspace.get(ref.name)?.delete(ref.callback),
  });
  let resolved = !parsing;
  const fantasy = scenarios.flatMap((scenario) => (scenario.fantasy ? [scenario.fantasy] : []));
  const creatures = fantasy.map((each) => each.creature);
  // While the plugin parses the vault, its bestiary holds nothing yet.
  if (fantasy[0]) installFantasyStatblocks(app, fantasy[0].layouts, () => (resolved ? creatures : []), () => resolved);
  return {
    app,
    files,
    edit: (path, text) => {
      files.set(path, text);
      const file = app.vault.getFileByPath(path);
      for (const callback of [...(listeners.get('changed') ?? [])]) callback(file);
    },
    resolveBestiary: () => {
      resolved = true;
      for (const callback of [...(workspace.get('fantasy-statblocks:bestiary:resolved') ?? [])]) callback();
    },
    dispose: () => {
      delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
      vi.restoreAllMocks();
    },
  };
}
