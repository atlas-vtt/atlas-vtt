// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';
import { useMapClipboardHotkeys } from '../../src/app/clipboard/useMapClipboardHotkeys';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { cleanup(); document.getSelection()?.removeAllRanges(); document.body.innerHTML = ''; });

it('leaves Cmd/Ctrl+C to the browser while page text is selected', () => {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as never;
  const copy = vi.fn();
  const paste = vi.fn();
  function View(): React.JSX.Element {
    useMapHotkeys({ copy, paste }, 'map');
    return <div data-view-id="map"><p id="log">Rolled 17</p></div>;
  }
  render(<AtlasUIContext.Provider value={{ app } as never}>
    <div className="workspace-leaf mod-active"><View /></div>
  </AtlasUIContext.Provider>);

  expect(fireEvent.keyDown(window, { key: 'c', metaKey: true })).toBe(false);
  expect(copy).toHaveBeenCalledTimes(1);

  const range = document.createRange();
  range.selectNodeContents(document.getElementById('log')!);
  document.getSelection()!.addRange(range);

  expect(fireEvent.keyDown(window, { key: 'c', metaKey: true })).toBe(true);
  expect(copy).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
  expect(paste).toHaveBeenCalledTimes(1);
});

it('registers no clipboard shortcuts in the player view', () => {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as never;
  const { app: vaultApp } = createInMemoryApp();
  const player = createViewAtlasStore(vaultApp, 'clipboard-hotkeys-player', undefined, true);
  function PlayerView(): React.JSX.Element {
    useMapClipboardHotkeys(player, null, 'player');
    return <div data-view-id="player" />;
  }
  render(<AtlasUIContext.Provider value={{ app } as never}>
    <div className="workspace-leaf mod-active"><PlayerView /></div>
  </AtlasUIContext.Provider>);

  expect(fireEvent.keyDown(window, { key: 'v', metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(window, { key: 'd', metaKey: true })).toBe(true);
});

it('clicking the map ends a text selection, so copy then acts on the map', () => {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as never;
  const { app: vaultApp } = createInMemoryApp();
  const store = createViewAtlasStore(vaultApp, 'clipboard-hotkeys-canvas');
  const canvas = document.createElement('canvas');
  const view = { serviceManager: { getRendererService: () => ({ getApp: () => ({ canvas }), getViewport: () => null }) } } as never;
  function MapView(): React.JSX.Element {
    useMapClipboardHotkeys(store, view, 'map');
    return <div data-view-id="map"><p id="log">Rolled 17</p></div>;
  }
  render(<AtlasUIContext.Provider value={{ app } as never}>
    <div className="workspace-leaf mod-active"><MapView /></div>
  </AtlasUIContext.Provider>);
  document.body.appendChild(canvas);

  const range = document.createRange();
  range.selectNodeContents(document.getElementById('log')!);
  document.getSelection()!.addRange(range);
  fireEvent.pointerDown(document.getElementById('log')!);
  expect(document.getSelection()!.isCollapsed).toBe(false);

  fireEvent.pointerDown(canvas);
  expect(document.getSelection()!.rangeCount).toBe(0);
  expect(fireEvent.keyDown(window, { key: 'c', metaKey: true })).toBe(false);
});
