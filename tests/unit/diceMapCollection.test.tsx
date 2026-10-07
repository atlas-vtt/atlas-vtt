import { EventEmitter } from 'events';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the rolls are captured where the stack would throw them.
const captured = vi.hoisted(() => ({ rolls: [] as Array<ReadonlyArray<{ scene: { lookId?: string } }>> }));
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
  warmStages: (): void => undefined,
}));
vi.mock('../../src/app/react/components/dice3d/DiceRollStack', () => ({
  DiceRollStack: ({ rolls }: { rolls: ReadonlyArray<{ scene: { lookId?: string } }> }): null => {
    captured.rolls.push(rolls);
    return null;
  },
}));

import { diceColourSlot } from '../../src/app/extensions/slots';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceTool } from '../../src/app/tools/DiceTool';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { emitRoll, sceneState, SCENE_A_TOKENS, setupPlayerDice } from '../helpers/playerDiceRolls';

const MAP = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';

async function vault(): Promise<InMemoryApp> {
  const memory = createInMemoryApp();
  new SettingsService(memory.app).setDiceDisplay('full');
  const assets = AssetService.getInstance(memory.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP } });
  await assets.updateCollectionIndexData('source', { diceLookId: 'ext:fire' });
  return memory;
}

const storeOn = (mapPath: string): never => createStore(() => ({ mapPath })) as never;

beforeEach(() => {
  AssetService.resetInstance();
  captured.rolls = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Atlas's dice in a map view know the map's collection", () => {
  it("the tray of a map view asks the colour providers with the map's collection and shows the picker", async () => {
    const memory = await vault();
    const provider = vi.fn(() => [{ name: 'Fire', color: '#dd3333' }]);
    const remove = diceColourSlot.add('ext', provider);
    render(
      <AtlasUIContext.Provider value={{ app: memory.app, view: null, pixiApp: null, renderer: null }}>
        <ViewStoreProvider store={storeOn(MAP)}>
          <DiceDropdownMenu diceTool={{ rollDice: vi.fn() } as unknown as DiceTool} isOpen onToggle={() => undefined} />
        </ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    expect(provider).toHaveBeenCalledWith('source');
    expect(screen.getByRole('button', { name: 'Fire' })).toBeTruthy();
    remove();
  });

  it("a roll in a GM map view and in the player window is thrown in the map collection's look; elsewhere the default's", async () => {
    const memory = await vault();
    const roll = { id: 'r1', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 3, max: 20 }], modifiers: 0, total: 3, crit: null };
    const show = (wrap: (children: React.ReactElement) => React.ReactElement, lookMapPath?: () => string | null): string | undefined => {
      const bus = new EventEmitter();
      captured.rolls = [];
      const { unmount } = render(
        <AtlasUIContext.Provider value={{ app: memory.app, view: null, pixiApp: null, renderer: null }}>
          {wrap(<DiceRollDisplay eventBus={bus} lookMapPath={lookMapPath} />)}
        </AtlasUIContext.Provider>,
      );
      act(() => { bus.emit('dice-rolled', { ...roll }); });
      const lookId = captured.rolls.at(-1)?.[0]?.scene.lookId;
      unmount();
      return lookId;
    };
    expect(show((children) => <ViewStoreProvider store={storeOn(MAP)}>{children}</ViewStoreProvider>)).toBe('ext:fire');
    // The player window has no view store: it names the presented scene's map (`PlayerDiceRolls`).
    expect(show((children) => children, () => MAP)).toBe('ext:fire');
    SettingsService.forApp(memory.app)!.setDiceLookId('ext:wood');
    expect(show((children) => <ViewStoreProvider store={storeOn('atlas-vtt/elsewhere.atlasmap')}>{children}</ViewStoreProvider>)).toBe('ext:wood');
  });

  it("the player window throws in the presented scene's collection look, though it lends no store since #319", async () => {
    const harness = setupPlayerDice('full');
    const assets = AssetService.getInstance(harness.app);
    await assets.initialize();
    await assets.createCollection('source');
    await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP } });
    await assets.updateCollectionIndexData('source', { diceLookId: 'ext:fire' });
    act(() => { harness.store.setState(sceneState(MAP, SCENE_A_TOKENS)); });
    act(() => harness.service.presentCanvas(harness.sourceFor(), 'scene-cave'));
    captured.rolls = [];
    emitRoll(harness.bus);
    expect(captured.rolls.at(-1)?.at(-1)?.scene.lookId).toBe('ext:fire');
    // While the window holds its picture the GM browses a scene outside every collection: players keep the presented look.
    act(() => { harness.service.holdCurrentFrame(); harness.store.setState(sceneState('maps/elsewhere.atlasmap', SCENE_A_TOKENS)); });
    emitRoll(harness.bus);
    expect(captured.rolls.at(-1)?.at(-1)?.scene.lookId).toBe('ext:fire');
    // That scene presented: the GM's look (Atlas's own).
    act(() => harness.service.presentCanvas(harness.sourceFor(), 'scene-elsewhere'));
    emitRoll(harness.bus);
    expect(captured.rolls.at(-1)?.at(-1)?.scene.lookId).toBe('');
  });
});
