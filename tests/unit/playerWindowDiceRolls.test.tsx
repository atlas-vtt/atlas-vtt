import { EventEmitter } from 'events';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';
import {
  MAP_A, MAP_B, MAP_C, SCENE_A_TOKENS, SCENE_B_TOKENS, WOLF_BITE, cardTexts, emitRoll, lastCard, originOf, sceneState, setupPlayerDice,
} from '../helpers/playerDiceRolls';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
// jsdom has no WebGL; the 3D panel's case is about what it names, not about the device.
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
}));
afterEach(() => { act(() => PlayerWindowService.getInstance()?.destroy()); vi.restoreAllMocks(); });

function setup(): { settings: SettingsService; store: StoreApi<ViewAtlasState>; doc: Document; bus: EventEmitter; service: PlayerWindowService } {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp({ files: { 'tokens/wolf.webp': '' } });
  const settings = new SettingsService(app);
  // The result cards; the 3D panel has its own case below.
  settings.setDiceDisplay('card');
  const store = createStore(() => ({
    objects: {
      tokens: {
        goblin: { id: 'goblin', kind: 'token', x: 0, y: 0, imagePath: '', isHidden: true },
        wolf: { id: 'wolf', kind: 'token', x: 0, y: 0, imagePath: 'tokens/wolf.webp', ringColor: '#aa0000' },
      },
    },
  })) as unknown as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, settings);
  const bus = new EventEmitter();
  const doc = attachFakePlayerWindow(service, { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store, diceEvents: bus });
  return { settings, store, doc, bus, service };
}

function roll(bus: EventEmitter, source?: DiceRollResult['source']): void {
  const result: DiceRollResult = {
    id: 'roll', timestamp: 0, formula: '1d20+4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17,
    ...(source ? { source } : {}),
  };
  act(() => { bus.emit('dice-rolled', result); });
}

const toastText = (doc: Document): string | undefined => doc.querySelector('.atlas-dice-toast')?.textContent ?? undefined;

describe('player window dice rolls', () => {
  it('follows only the presented view, rebinds on switching and releases closed views', () => {
    const { settings, store, doc, bus, service } = setup();
    const other = new EventEmitter();
    const otherStore = createStore(() => store.getState());
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll(other);
    expect(toastText(doc)).toBeUndefined();
    act(() => service.holdCurrentFrame());
    roll(bus);
    expect(toastText(doc)).toContain('17');
    act(() => service.presentCanvas({ canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store: otherStore, diceEvents: other }, 'scene-b'));
    expect(toastText(doc)).toBeUndefined();
    expect(bus.listenerCount('dice-rolled')).toBe(0);
    roll(bus);
    expect(toastText(doc)).toBeUndefined();
    act(() => service.releaseSource(store));
    expect(other.listenerCount('dice-rolled')).toBe(1);
    roll(other);
    expect(toastText(doc)).toContain('17');
    act(() => service.releaseSource(otherStore));
    expect(other.listenerCount('dice-rolled')).toBe(0);
    roll(other);
    expect(toastText(doc)).toBeUndefined();
    act(() => service.releaseHeldFrame({ canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store, diceEvents: bus }));
    roll(bus);
    expect(toastText(doc)).toContain('17');
    act(() => service.destroy());
    expect(bus.listenerCount('dice-rolled')).toBe(0);
  });

  it('shows rolls only while the DM shares them', () => {
    const { settings, doc, bus } = setup();
    roll(bus);
    expect(toastText(doc)).toBeUndefined();

    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll(bus);
    expect(toastText(doc)).toContain('17');

    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    expect(toastText(doc)).toBeUndefined();
  });

  it('names nothing, ability included, for a token hidden on the map', () => {
    const { doc, bus, store } = setupPlayerDice();
    const source = { type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' } as const;

    emitRoll(bus, source, originOf(MAP_A, 'goblin'));
    expect(lastCard(doc)?.textContent).toContain('17');
    expect(lastCard(doc)?.textContent).not.toContain('Goblin Boss');
    expect(lastCard(doc)?.textContent).not.toContain('Scimitar');

    act(() => store.setState({ objects: { tokens: { ...SCENE_A_TOKENS, goblin: { ...SCENE_A_TOKENS.goblin, isHidden: false } } } } as unknown as Partial<ViewAtlasState>));
    emitRoll(bus, source, originOf(MAP_A, 'goblin'));
    expect(lastCard(doc)?.textContent).toContain('Goblin Boss');
    expect(lastCard(doc)?.textContent).toContain('Scimitar');
  });

  it.each([
    ['a statblock without a token', { type: 'statblock', statblockPath: 'Bestiary/Wolf.md', tokenName: 'Wolf', abilityName: 'Bite' }, originOf(MAP_A)],
    ['a token on another scene', WOLF_BITE, originOf('maps/elsewhere.atlasmap')],
    ['a token no scene holds', { ...WOLF_BITE, tokenId: 'ghost' }, originOf(MAP_A, 'ghost')],
  ] as const)('names nothing for %s', (_, source, origin) => {
    const { doc, bus } = setupPlayerDice();
    emitRoll(bus, source, origin);
    expect(lastCard(doc)?.textContent).toContain('17');
    expect(lastCard(doc)?.textContent).not.toMatch(/Wolf|Bite/);
    expect(lastCard(doc)?.querySelector('.atlas-dice-toast__avatar')).toBeNull();
  });

  // The portrait is the token as it stands on the presented map: its artwork
  // and its ring, as in the DM's window, not whatever its statblock pictures.
  it('shows a token with the artwork and ring it has on the map', () => {
    const { doc, bus } = setupPlayerDice();
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    const portrait = doc.querySelector('.atlas-token-portrait');
    expect(portrait?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
    expect(portrait?.querySelector('img')?.getAttribute('alt')).toBe('Wolf');
    expect(portrait?.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color')).toBe('#aa0000');
  });

  it('throws 3D dice without naming a hidden token', () => {
    const { doc, bus } = setupPlayerDice('full');
    emitRoll(bus, { type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' }, originOf(MAP_A, 'goblin'));
    const panel = doc.querySelector('.atlas-dice-roll');
    expect(panel).not.toBeNull();
    expect(panel?.outerHTML).not.toMatch(/Goblin|Scimitar/);
    expect(panel?.querySelector('img')).toBeNull();
    expect(doc.querySelector('.atlas-dice-toast')).toBeNull();
  });
});

describe('who a roll names in the player window', () => {
  it('shows a portrait and the ability but no name, nor alt text, while nameplates are off', () => {
    for (const display of ['card', 'full'] as const) {
      const { doc, bus, settings } = setupPlayerDice(display);
      act(() => settings.setLocalPlayerViewSettings({ showTokenNameplates: false }));
      emitRoll(bus, WOLF_BITE, originOf(MAP_A));
      const shown = doc.querySelector(display === 'card' ? '.atlas-dice-toast' : '.atlas-dice-roll');
      expect(shown?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
      expect(shown?.querySelector('img')?.getAttribute('alt')).toBe('');
      expect(shown?.outerHTML).not.toContain('Wolf');
      expect(shown?.textContent).toContain('Bite');
      act(() => PlayerWindowService.getInstance()?.destroy());
    }
  });

  it('shows no name, initial or portrait for a roll it may not name', () => {
    for (const display of ['card', 'full'] as const) {
      const { doc, bus } = setupPlayerDice(display);
      emitRoll(bus, WOLF_BITE);
      const shown = doc.querySelector(display === 'card' ? '.atlas-dice-toast' : '.atlas-dice-roll');
      expect(shown).not.toBeNull();
      expect(shown?.outerHTML).not.toMatch(/Wolf|Bite|wolf\.webp/);
      expect(shown?.querySelector('.atlas-dice-toast__avatar, .atlas-dice-roll__avatar')).toBeNull();
      act(() => PlayerWindowService.getInstance()?.destroy());
    }
  });

  it('keeps who a roll named when the scene changes before the roll is drawn', () => {
    const { doc, bus, store } = setupPlayerDice();
    act(() => {
      bus.emit('dice-rolled', { id: 'early', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 9, max: 20 }], modifiers: 0, total: 9, source: WOLF_BITE }, originOf(MAP_A));
      store.setState(sceneState(MAP_B, SCENE_B_TOKENS));
    });
    expect(lastCard(doc)?.textContent).toContain('Wolf');
    expect(lastCard(doc)?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
  });

  it('never names a roll later that it did not name when it came', () => {
    const { doc, bus, store } = setupPlayerDice();
    emitRoll(bus, { ...WOLF_BITE, tokenId: 'ghost', tokenName: 'Ghost' }, originOf(MAP_A, 'ghost'));
    act(() => store.setState({ objects: { tokens: { ...SCENE_A_TOKENS, ghost: { ...SCENE_A_TOKENS.wolf, id: 'ghost', name: 'Ghost' } } } } as unknown as Partial<ViewAtlasState>));
    expect(lastCard(doc)?.textContent).not.toContain('Ghost');
    expect(lastCard(doc)?.querySelector('img')).toBeNull();
  });

  it('keeps a shown roll as it came; the next roll follows fog and the nameplate setting', () => {
    const { doc, bus, perception, settings } = setupPlayerDice();
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    perception.current = () => 'unseen';
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    const [first, second] = cardTexts(doc);
    expect(first).toContain('Wolf');
    expect(second).not.toContain('Wolf');

    perception.current = undefined;
    act(() => settings.setLocalPlayerViewSettings({ showTokenNameplates: false }));
    expect(cardTexts(doc)[0]).toContain('Wolf');
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');
    expect(lastCard(doc)?.querySelector('img')).not.toBeNull();
  });
});

describe('which scene names the rolls in the player window', () => {
  it('names a token the presented scene shows, live, and nobody once it does not', () => {
    const { doc, bus, perception, shownTokens } = setupPlayerDice();
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('Wolf');
    expect(lastCard(doc)?.textContent).toContain('Bite');
    // A live roll asks about its own token only
    expect(shownTokens.mock.calls).toEqual([[['wolf']]]);

    perception.current = (id) => (id === 'wolf' ? 'sensed' : 'seen');
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('17');
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');
    expect(lastCard(doc)?.textContent).not.toContain('Bite');
  });

  it('names nobody while the presented scene is loading, failed to load, or offers no answer', () => {
    const { doc, bus, store, service, sourceFor } = setupPlayerDice();
    act(() => store.setState({ isMapLoading: true }));
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');
    act(() => store.setState({ isMapLoading: false, mapLoaded: false }));
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');

    act(() => store.setState({ mapLoaded: true }));
    const { rollSources: _, ...withoutAnswers } = sourceFor();
    act(() => service.releaseHeldFrame(withoutAnswers));
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('17');
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');
  });

  it('keeps the held scene while its store loads another with the same token id', () => {
    const { doc, bus, store, service } = setupPlayerDice();
    act(() => service.holdCurrentFrame());
    act(() => store.setState(sceneState(MAP_B, SCENE_B_TOKENS)));

    // A roll from a statblock opened on A is still named by A's picture
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('Wolf');
    expect(lastCard(doc)?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');

    // One from B, or without proof, shows its numbers and nothing else
    for (const origin of [originOf(MAP_B), undefined]) {
      emitRoll(bus, { ...WOLF_BITE, tokenName: 'Bone Hound' }, origin);
      const card = lastCard(doc);
      expect(card?.textContent).toContain('17');
      expect(card?.textContent).not.toMatch(/Wolf|Bone Hound|Bite/);
      expect(card?.querySelector('img')).toBeNull();
    }
  });

  it('keeps the first held picture across A, B and C, and goes live again once A is rendered', () => {
    const { doc, bus, store, service, perception, shownTokens, sourceFor } = setupPlayerDice();
    shownTokens.mockClear();
    act(() => service.holdCurrentFrame());
    act(() => store.setState(sceneState(MAP_B, SCENE_B_TOKENS)));
    act(() => service.holdCurrentFrame());
    act(() => store.setState(sceneState(MAP_C, SCENE_B_TOKENS)));
    act(() => service.holdCurrentFrame());
    expect(shownTokens).toHaveBeenCalledTimes(1);
    expect(shownTokens).toHaveBeenCalledWith(undefined);

    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('Wolf');
    expect(shownTokens).toHaveBeenCalledTimes(1);

    // Back on A, rendered again: live
    act(() => store.setState(sceneState(MAP_A, SCENE_A_TOKENS)));
    act(() => service.releaseHeldFrame(sourceFor()));
    perception.current = () => 'unseen';
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');
  });

  it('stays live under a camera freeze, unlike a held picture', () => {
    const { doc, bus, service, perception } = setupPlayerDice();
    act(() => service.freezeCamera({ centerX: 0, centerY: 0, scale: 1 }));
    perception.current = () => 'unseen';
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toContain('Wolf');

    perception.current = undefined;
    act(() => service.holdCurrentFrame());
    perception.current = () => 'unseen';
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('Wolf');
  });

  it('keeps the cards shown when another scene of the same view is presented, and names by the new one', () => {
    const { doc, bus, store, service, sourceFor } = setupPlayerDice();
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    act(() => store.setState(sceneState(MAP_B, SCENE_B_TOKENS)));
    act(() => service.presentCanvas(sourceFor(), 'scene-b'));

    expect(cardTexts(doc)).toHaveLength(1);
    expect(cardTexts(doc)[0]).toContain('Wolf');
    expect(doc.querySelector('.atlas-dice-toast img')?.getAttribute('src')).toContain('tokens/wolf.webp');

    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).not.toMatch(/Wolf|Bite/);
    emitRoll(bus, { ...WOLF_BITE, tokenName: 'Bone Hound' }, originOf(MAP_B));
    expect(lastCard(doc)?.textContent).toContain('Bone Hound');
    expect(lastCard(doc)?.querySelector('img')?.getAttribute('src')).toContain('tokens/hound.webp');
  });

  it('starts afresh for another view, and lets go of every source on release and close', () => {
    const { doc, bus, store, service, sourceFor } = setupPlayerDice();
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    const other = new EventEmitter();
    act(() => service.presentCanvas(sourceFor(other), 'scene-other'));
    expect(cardTexts(doc)).toEqual([]);
    expect(bus.listenerCount('dice-rolled')).toBe(0);

    act(() => service.releaseSource(store));
    expect(other.listenerCount('dice-rolled')).toBe(0);
    emitRoll(other, WOLF_BITE, originOf(MAP_A));
    expect(cardTexts(doc)).toEqual([]);

    act(() => service.releaseHeldFrame(sourceFor()));
    emitRoll(bus, WOLF_BITE, originOf(MAP_A));
    expect(lastCard(doc)?.textContent).toContain('Wolf');
    act(() => service.destroy());
    expect(bus.listenerCount('dice-rolled')).toBe(0);
  });
});
