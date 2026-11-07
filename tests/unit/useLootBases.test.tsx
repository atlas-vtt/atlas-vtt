// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { App, TFile } from 'obsidian';
import { fakeQueries as queries } from '../mocks/fakeLootQueries';
import { useLootBases } from '../../src/app/react/components/loot/useLootBases';

vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));

const PATH = 'Loot/Items.base';
type VaultHandler = (file: TFile, oldPath?: string) => void;

function vaultApp(files: Record<string, string>): { app: App; emit: (event: string, path: string) => void; listeners: () => number } {
  const handlers = new Map<object, { event: string; handler: VaultHandler }>();
  const app = new App();
  app.vault = {
    getAbstractFileByPath: (path: string) => (path in files ? new TFile(path) : null),
    cachedRead: (file: TFile) => Promise.resolve(files[file.path] ?? ''),
    on: (event: string, handler: VaultHandler) => {
      const ref = {};
      handlers.set(ref, { event, handler });
      return ref;
    },
    offref: (ref: object) => handlers.delete(ref),
  };
  return {
    app,
    emit: (event, path) => {
      for (const entry of handlers.values()) if (entry.event === event) entry.handler(new TFile(path));
    },
    listeners: () => handlers.size,
  };
}

const EMPTY = { entries: [], order: [], displayNames: {} };

beforeEach(() => {
  queries.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLootBases', () => {
  it('reads each base once, however often the caller passes a new list of the same paths', async () => {
    const { app } = vaultApp({ [PATH]: 'views:\n  - name: Weapons\n' });
    const { rerender } = renderHook(() => useLootBases(app, [PATH]));
    await waitFor(() => expect(queries.started).toHaveLength(1));
    rerender();
    rerender();
    expect(queries.started).toHaveLength(1);
  });

  it('is loaded once every view has answered', async () => {
    const { app } = vaultApp({ [PATH]: 'views:\n  - name: Weapons\n  - name: Armor\n' });
    const { result } = renderHook(() => useLootBases(app, [PATH]));
    await waitFor(() => expect(queries.started).toHaveLength(2));
    expect(result.current.loaded).toBe(false);

    act(() => {
      for (const entry of queries.started) entry.listener.onSnapshot(EMPTY);
    });
    expect(result.current).toMatchObject({ loaded: true, basesAvailable: true });
  });

  it('stops loading and says Bases is off when Obsidian cannot run a view', async () => {
    const { app } = vaultApp({ [PATH]: 'views:\n  - name: Weapons\n' });
    const { result } = renderHook(() => useLootBases(app, [PATH]));
    await waitFor(() => expect(queries.started).toHaveLength(1));

    act(() => queries.started[0]?.listener.onUnavailable());
    expect(result.current).toMatchObject({ loaded: true, basesAvailable: false });
  });

  it('reads a base again when its file changes, and leaves other files alone', async () => {
    const files = { [PATH]: 'views:\n  - name: Weapons\n' };
    const { app, emit } = vaultApp(files);
    const { result } = renderHook(() => useLootBases(app, [PATH]));
    await waitFor(() => expect(result.current.bases[0]?.views.map((view) => view.name)).toEqual(['Weapons']));

    act(() => emit('modify', 'Notes/Other.md'));
    expect(queries.started).toHaveLength(1);

    files[PATH] = 'views:\n  - name: Rings\n';
    act(() => emit('modify', PATH));
    await waitFor(() => expect(result.current.bases[0]?.views.map((view) => view.name)).toEqual(['Rings']));
    expect(queries.started[0]?.stopped).toBe(true);
  });

  it('stops its queries and vault listeners when unmounted', async () => {
    const { app, listeners } = vaultApp({ [PATH]: 'views:\n  - name: Weapons\n' });
    const { unmount } = renderHook(() => useLootBases(app, [PATH]));
    await waitFor(() => expect(queries.started).toHaveLength(1));

    unmount();
    expect(queries.started[0]?.stopped).toBe(true);
    expect(listeners()).toBe(0);
  });
});
