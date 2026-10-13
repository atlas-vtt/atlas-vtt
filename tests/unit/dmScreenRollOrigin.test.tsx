import React, { useLayoutEffect } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn(), addTokenHighlight: vi.fn() }));
vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/react/components/LinkedNotePicker', () => ({ default: () => null }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app, view }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import DMScreen from '../../src/app/react/components/DMScreen';

const WOLF = 'statblocks/Wolf.md';
const MAP_A = 'maps/a.atlasmap';
const MAP_B = 'maps/b.atlasmap';
const view = { viewId: 'view-1' };
const origins: unknown[] = [];
const diceTool = { rollDice: vi.fn((_formula: string, _source: unknown, origin?: unknown) => { origins.push(origin); return null; }) };
const app = {
  workspace: {
    on: vi.fn(), offref: vi.fn(),
    getLeavesOfType: () => [{ view: { viewId: 'view-1', serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) } } }],
  },
  vault: { getAbstractFileByPath: (path: string) => (path === WOLF ? new TFile(WOLF) : null) },
  metadataCache: { getFileCache: () => null },
  plugins: { plugins: { 'obsidian-5e-statblocks': { manager: {
    getAllLayouts: () => [],
    getDefaultLayout: () => ({ name: 'Basic', id: 'basic', blocks: [{ type: 'property', id: 'bite', properties: ['bite'], display: 'Bite' }] }),
  } } } },
};

function scene(mapPath: string, name: string, changes: object = {}): typeof state {
  return {
    mapPath, mapLoaded: true, isMapLoading: false,
    objects: { tokens: { wolf: { id: 'wolf', kind: 'character', name, x: 0, y: 0, imagePath: '', statblockPath: WOLF } } },
    dmNotePath: null, setDMNotePath: vi.fn(), updateToken: vi.fn(),
    ...changes,
  };
}

let state: { mapPath: string; mapLoaded: boolean; isMapLoading: boolean; objects: { tokens: Record<string, object> }; dmNotePath: null; setDMNotePath: () => void; updateToken: () => void };

/** Clicks the first dice link while a render is committed, before the screen's effects run. */
function ClickDuringCommit({ armed }: { armed: boolean }): null {
  useLayoutEffect(() => {
    if (armed) document.querySelector<HTMLElement>('.atlas-dice-link')?.click();
  });
  return null;
}

const screenWith = (armed: boolean): React.ReactElement => (
  <>
    <DMScreen isOpen onClose={vi.fn()} />
    <ClickDuringCommit armed={armed} />
  </>
);

function clickBite(): void {
  document.querySelector<HTMLElement>('.atlas-dice-link')!.click();
}

beforeEach(() => {
  origins.length = 0;
  state = scene(MAP_A, 'Wolf');
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => [{ name: 'Wolf', path: WOLF, bite: '1d6+2' }],
    hasCreature: () => false,
    isResolved: () => true,
  } });
});

afterEach(() => {
  cleanup();
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
});

describe('DM screen roll origin', () => {
  it('names the scene its statblocks were drawn for until the next scene replaces them', async () => {
    const { rerender } = render(screenWith(false));
    await waitFor(() => expect(document.querySelector('.atlas-dice-link')).not.toBeNull());
    clickBite();
    expect(origins.pop()).toEqual({ viewId: 'view-1', mapPath: MAP_A, tokenId: 'wolf' });

    // Scene B holds a token with the same id. Until the screen takes B's tokens, a click is A's.
    state = scene(MAP_B, 'Bone Hound');
    rerender(screenWith(true));
    expect(origins.shift()).toEqual({ viewId: 'view-1', mapPath: MAP_A, tokenId: 'wolf' });

    origins.length = 0;
    rerender(screenWith(false));
    clickBite();
    expect(origins.pop()).toEqual({ viewId: 'view-1', mapPath: MAP_B, tokenId: 'wolf' });
  });

  it('names no scene for statblocks drawn while a scene loads', async () => {
    const { rerender } = render(screenWith(false));
    await waitFor(() => expect(document.querySelector('.atlas-dice-link')).not.toBeNull());
    state = scene(MAP_B, 'Bone Hound', { isMapLoading: true });
    rerender(screenWith(false));
    clickBite();
    expect(origins.pop()).toBeUndefined();
  });
});
