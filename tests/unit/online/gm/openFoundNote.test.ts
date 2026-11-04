// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type Plugin } from 'obsidian';
import { OnlineFeature } from '../../../../src/app/online/gm/OnlineFeature.ts';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

type OpenNote = (link: string, sourcePath: string) => void;

const log = vi.hoisted(() => ({ openNote: null as OpenNote | null }));
vi.mock('../../../../src/app/online/gm/log/LogMounts.ts', () => ({
  LogMounts: class {
    constructor(deps: { openNote: OpenNote }) {
      log.openNote = deps.openNote;
    }
    sync(): void {}
    refresh(): void {}
    logChanged(): void {}
    close(): void {}
  },
}));

const NOTE = 'Book/Chapter.md';
const HEADINGS = [
  { heading: 'Inn', level: 1, position: { start: { line: 0 } } },
  { heading: 'Overview', level: 2, position: { start: { line: 1 } } },
  { heading: 'Overview', level: 2, position: { start: { line: 5 } } },
];

describe('the found entry of the table log', () => {
  afterEach(() => {
    log.openNote = null;
  });

  it('opens the very heading players read, where the link counts past the first of its name', async () => {
    const { app } = createInMemoryApp({ files: { [NOTE]: '' } });
    app.vault.getAbstractFileByPath = (path: string): TFile | null => (path === NOTE ? new TFile(NOTE) : null);
    app.metadataCache.getFileCache = () => ({ headings: HEADINGS }) as never;
    const openLinkText = vi.fn(() => Promise.resolve());
    app.workspace.openLinkText = openLinkText;

    const feature = new OnlineFeature({ app, manifest: { version: '0' }, register: vi.fn() } as unknown as Plugin, { read: () => Promise.resolve(undefined), write: () => Promise.resolve() } as never);
    feature.onload();
    await vi.waitFor(() => expect(log.openNote).not.toBeNull());
    log.openNote!(`${NOTE}#Inn#Overview#`, 'Maps/map.atlasmap');

    await vi.waitFor(() => expect(openLinkText).toHaveBeenCalledWith(NOTE, 'Maps/map.atlasmap', true, { eState: { line: 5 } }));
    feature.unload();
  });
});
