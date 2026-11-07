// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';
import { useAssetManagerEffects } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects';

type EffectDeps = Parameters<typeof useAssetManagerEffects>[0];

function setup({ subModalOpen = false, changeTab = vi.fn() } = {}) {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as any;
  const settings = new SettingsService(app);
  const mapAction = vi.fn();
  function Harness() {
    const [isOpen, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    useMapHotkeys({ assets: () => setOpen(open => !open), move: mapAction }, 'map');
    useAssetManagerEffects({
      isOpen, onClose: () => setOpen(false), modalRef, containerRef,
      // A new callback on every render, as the manager's own is
      activeTab: 'maps', changeTab: (tab) => changeTab(tab),
      data: { app } as EffectDeps['data'],
      sel: {
        selectedAssetIds: [], setSelectedAssetIds: vi.fn(), setSelectedFolderIds: vi.fn(),
        setSelectedFolderId: vi.fn(), setSelectedTagIds: vi.fn(), setSpawnCounts: vi.fn(),
        navigationHistory: { clear: vi.fn(), push: vi.fn() },
      } as unknown as EffectDeps['sel'],
      crud: {
        isTokenCreatorOpen: false, isMapCreatorOpen: false, isCreateSceneModalOpen: false,
        isMoveModalOpen: false, settingsModalCollectionId: null, transfer: null,
        inputModalState: { isOpen: subModalOpen }, setEditingToken: vi.fn(),
      } as unknown as EffectDeps['crud'],
      tags: { isTagManagerOpen: false } as EffectDeps['tags'],
      statblock: { linkingStatblockAsset: null } as EffectDeps['statblock'],
    });
    return <div className="workspace-leaf mod-active"><div data-view-id="map">
      {isOpen && <div ref={modalRef} className="atlas-asset-manager-modal" tabIndex={-1} data-testid="manager">
        <div ref={containerRef}><input aria-label="Search assets" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>}
    </div></div>;
  }
  render(<AtlasUIContext.Provider value={{ app } as any}><Harness /></AtlasUIContext.Provider>);
  return { settings, mapAction, changeTab };
}

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

it('opens with A and closes on the second press without reopening as the event bubbles', () => {
  setup();
  fireEvent.keyDown(document.body, { key: 'a' });
  fireEvent.keyDown(screen.getByTestId('manager'), { key: 'a' });
  expect(screen.queryByTestId('manager')).toBeNull();
});

it('uses the current custom binding to close the manager', () => {
  const { settings } = setup();
  fireEvent.keyDown(document.body, { key: 'a' });
  settings.setHotkey('assets', 'q');
  fireEvent.keyDown(screen.getByTestId('manager'), { key: 'a' });
  expect(screen.queryByTestId('manager')).not.toBeNull();
  fireEvent.keyDown(screen.getByTestId('manager'), { key: 'q' });
  expect(screen.queryByTestId('manager')).toBeNull();
});

it('keeps typing, select-all, held keys and map shortcuts from closing the manager', () => {
  const { mapAction } = setup();
  fireEvent.keyDown(document.body, { key: 'a' });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });
  const manager = screen.getByTestId('manager');
  for (const event of [{ key: 'a', metaKey: true }, { key: 'a', ctrlKey: true },
    { key: 'a', repeat: true }, { key: 'a', isComposing: true }, { key: 'v' }]) {
    fireEvent.keyDown(manager, event);
  }
  expect(screen.queryByTestId('manager')).not.toBeNull();
  expect(mapAction).not.toHaveBeenCalled();
});

it('keeps focus in the search field while typing', () => {
  setup();
  fireEvent.keyDown(document.body, { key: 'a' });
  const input = screen.getByRole('textbox');
  input.focus();
  fireEvent.change(input, { target: { value: 'g' } });
  fireEvent.change(input, { target: { value: 'go' } });
  expect(document.activeElement).toBe(input);
});

it('does not close the manager while a child dialog is open', () => {
  setup({ subModalOpen: true });
  fireEvent.keyDown(document.body, { key: 'a' });
  fireEvent.keyDown(screen.getByTestId('manager'), { key: 'a' });
  expect(screen.queryByTestId('manager')).not.toBeNull();
});

it.each(['atlas-onboarding-overlay', 'menu', 'modal-container'])('does not close through a %s overlay', (className) => {
  setup();
  fireEvent.keyDown(document.body, { key: 'a' });
  const overlay = document.createElement('div');
  overlay.className = className;
  document.body.append(overlay);
  fireEvent.keyDown(overlay, { key: 'a' });
  expect(screen.queryByTestId('manager')).not.toBeNull();
});

it('switches tabs with Tab, Shift+Tab and Cmd+1 to 5 through the tab change that resets the folder', () => {
  const { changeTab } = setup();
  fireEvent.keyDown(document, { key: 'a' });
  const manager = screen.getByTestId('manager');
  fireEvent.keyDown(manager, { key: 'Tab' });
  fireEvent.keyDown(manager, { key: 'Tab', shiftKey: true });
  fireEvent.keyDown(manager, { key: '4', metaKey: true });
  fireEvent.keyDown(manager, { key: '5', ctrlKey: true });
  fireEvent.keyDown(manager, { key: '6', metaKey: true });
  expect(changeTab.mock.calls.map(([tab]) => tab)).toEqual(['encounters', 'scenes', 'tokens', 'party']);
});
