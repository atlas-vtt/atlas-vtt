import { describe, expect, it } from 'vitest';
import { systemTrash } from '../../src/app/services/electronRemote';

/** A shell whose `trashItem` records the paths it was given. */
function shell(trashed: string[]): { trashItem: (path: string) => Promise<void> } {
  return { trashItem: (path) => { trashed.push(path); return Promise.resolve(); } };
}

/** A window whose `require('electron')` answers with `electron`. */
function windowWith(electron: object): Window {
  const win = { require: (name: string): unknown => (name === 'electron' ? electron : null) };
  return win as unknown as Window;
}

describe('systemTrash', () => {
  it('trashes through the main process where remote has a shell, not through the window', async () => {
    const byMain: string[] = [];
    const byWindow: string[] = [];
    const trash = systemTrash(windowWith({ shell: shell(byWindow), remote: { shell: shell(byMain) } }));
    await trash?.('C:\\Music\\Hornet.opus');
    expect(byMain).toEqual(['C:\\Music\\Hornet.opus']);
    expect(byWindow).toEqual([]);
  });

  it("falls back on the window's shell where remote is missing", async () => {
    const byWindow: string[] = [];
    const trash = systemTrash(windowWith({ shell: shell(byWindow) }));
    await trash?.('/music/hornet.opus');
    expect(byWindow).toEqual(['/music/hornet.opus']);
  });

  it('is null where no shell can trash', () => {
    expect(systemTrash(windowWith({ remote: {} }))).toBeNull();
    expect(systemTrash({} as Window)).toBeNull();
  });
});
