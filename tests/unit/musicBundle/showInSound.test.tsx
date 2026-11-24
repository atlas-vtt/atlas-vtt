// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CollectionTransferLayer } from '../../../src/app/packages/components/asset-manager/collection-transfer/CollectionTransferLayer';
import { useInstalledItemOpener } from '../../../src/app/packages/components/asset-manager/hooks/useInstalledItemOpener';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import type { MusicImportResult } from '../../../src/app/services/musicBundle/musicImport';

const calls: string[] = [];
vi.mock('../../../src/app/sound-view', () => ({
  showSoundView: vi.fn(() => {
    calls.push('sound tab');
    return Promise.resolve();
  }),
}));

const app = {} as App;
afterEach(() => {
  cleanup();
  calls.length = 0;
});

const music: MusicImportResult = { kind: 'music-album', name: 'Night of the Wilds', version: 1, outcome: 'new', tags: ['Night of the Wilds'], putBack: [] };

describe('Show in Sound after a music install', () => {
  it('closes the asset manager before it opens the Sound tab, so the tab is not covered', () => {
    const { result } = renderHook(() => useInstalledItemOpener({
      app, selectedCollection: 'default', setSettingsModalCollectionId: vi.fn(), closeAssetManager: () => calls.push('asset manager closed'),
    }));
    result.current.openSound();
    expect(calls).toEqual(['asset manager closed', 'sound tab']);
  });

  it('ends the done dialog and hands the GM to the Sound tab', () => {
    const closeTransfer = vi.fn(() => calls.push('dialog closed'));
    const openSound = vi.fn(() => calls.push('show sound'));
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <CollectionTransferLayer
          transfer={{ step: 'done', title: 'Added to your music', message: 'Night of the Wilds v1 is in your music folder.', music }}
          confirmExport={vi.fn()} confirmImport={vi.fn()} confirmItemImport={vi.fn()} confirmMusicImport={vi.fn()}
          closeTransfer={closeTransfer}
          openSound={openSound}
        />
      </AtlasUIContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show in Sound' }));
    expect(calls).toEqual(['dialog closed', 'show sound']);
  });

  it('offers no Show in Sound where there is nowhere to show it', () => {
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <CollectionTransferLayer
          transfer={{ step: 'done', title: 'Added to your music', message: '', music }}
          confirmExport={vi.fn()} confirmImport={vi.fn()} confirmItemImport={vi.fn()} confirmMusicImport={vi.fn()}
          closeTransfer={vi.fn()}
        />
      </AtlasUIContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Show in Sound' })).toBeNull();
  });
});
