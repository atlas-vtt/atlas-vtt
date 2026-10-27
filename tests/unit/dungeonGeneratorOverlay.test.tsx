// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openCreatedScene } from '../../src/app/import/openCreatedScene';
import { DungeonGeneratorOverlay } from '../../src/app/packages/components/dungeon-generator/DungeonGeneratorOverlay';
import type { DungeonWizardProps } from '../../src/app/packages/components/dungeon-generator/DungeonWizard';
import { generateDungeonFor } from '../../src/app/packages/components/dungeon-generator/openDungeonGenerator';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { canRunMapHotkeys } from '../../src/app/keyboard/mapHotkeys';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const panel = vi.hoisted(() => ({ props: null as DungeonWizardProps | null }));
vi.mock('../../src/app/packages/components/dungeon-generator/DungeonWizard', () => ({
  DungeonWizard: (props: DungeonWizardProps) => {
    panel.props = props;
    return <button type="button" onClick={props.onClose}>Close</button>;
  },
}));
vi.mock('../../src/app/import/openCreatedScene', () => ({ openCreatedScene: vi.fn(async () => true) }));

const SCENE = { name: 'Crypt', scenePath: 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap' };

function mount(): { store: ViewAtlasStore } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `overlay-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}>
        <DungeonGeneratorOverlay />
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { store };
}

beforeEach(() => { MotionGlobalConfig.skipAnimations = true; });
afterEach(() => {
  MotionGlobalConfig.skipAnimations = false;
  cleanup();
  panel.props = null;
  vi.clearAllMocks();
});

describe('the dungeon generator over the map', () => {
  it('takes the pin dropdown\'s place, closes with its X and tells the pin no scene came', async () => {
    const { store } = mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    let result: Promise<{ scenePath: string } | null> = Promise.resolve(null);
    const anchor = { left: 120, top: 80, width: 320, height: 400 };
    act(() => { result = generateDungeonFor(store, { name: 'Crypt', collectionId: 'Dungeons', anchor }); });
    const dialog = screen.getByRole('dialog', { name: 'Dungeon generator' });
    expect(dialog.classList.contains('atlas-dungeon-generator-overlay')).toBe(true);
    // A pin fixes the name and the collection, and the wizard opens where its dropdown stood
    expect(panel.props).toMatchObject({ initialName: 'Crypt', collectionId: 'Dungeons', anchor });
    expect(panel.props!.layer).toBe(dialog);
    // The map's shortcuts wait while it is open
    expect(canRunMapHotkeys(new KeyboardEvent('keydown', { key: 'v' }))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(result).resolves.toBeNull();
  });

  it('closes on a press beside the wizard and tells the pin no scene came', async () => {
    const { store } = mount();
    let result: Promise<{ scenePath: string } | null> = Promise.resolve(null);
    act(() => { result = generateDungeonFor(store, { name: 'Crypt', collectionId: 'Dungeons' }); });
    fireEvent.pointerDown(document.querySelector('.atlas-dungeon-generator-overlay__backdrop')!);
    await expect(result).resolves.toBeNull();
    expect(store.getState().dungeonGenerator).toBeNull();
  });

  it('hands a pin its scene and shows the map again without opening the scene', async () => {
    const { store } = mount();
    let result: Promise<{ scenePath: string } | null> = Promise.resolve(null);
    act(() => { result = generateDungeonFor(store, { name: 'Crypt', collectionId: 'Dungeons' }); });
    act(() => panel.props!.onCreated(SCENE));
    await expect(result).resolves.toEqual({ scenePath: SCENE.scenePath });
    expect(store.getState().dungeonGenerator).toBeNull();
    expect(openCreatedScene).not.toHaveBeenCalled();
  });

  it('closes on Escape, but not while a scene is being written', async () => {
    const { store } = mount();
    act(() => { void generateDungeonFor(store, { name: 'Crypt', collectionId: 'Dungeons' }); });
    act(() => panel.props!.onBusyChange!(true));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeDefined();
    act(() => panel.props!.onBusyChange!(false));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lets a scene still being written answer its pin after the generator was opened anew, closing nothing', async () => {
    const { store } = mount();
    let first: Promise<{ scenePath: string } | null> = Promise.resolve(null);
    act(() => { first = generateDungeonFor(store, { name: 'Crypt', collectionId: 'Dungeons' }); });
    const writing = panel.props!;
    act(() => writing.onBusyChange!(true));
    act(() => { void generateDungeonFor(store, { name: 'Vault', collectionId: 'Dungeons' }); });
    expect(panel.props!.initialName).toBe('Vault');
    act(() => writing.onCreated(SCENE));
    await expect(first).resolves.toEqual({ scenePath: SCENE.scenePath });
    // The newer generator stays open, and the older scene opens nowhere
    expect(store.getState().dungeonGenerator?.name).toBe('Vault');
    expect(openCreatedScene).not.toHaveBeenCalled();
  });
});
