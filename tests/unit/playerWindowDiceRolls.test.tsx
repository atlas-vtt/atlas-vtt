import { EventEmitter } from 'events';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

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

  it('does not name a token that is hidden on the map', () => {
    const { settings, store, doc, bus } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    const source = { type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' } as const;

    roll(bus, source);
    expect(toastText(doc)).toContain('Scimitar');
    expect(toastText(doc)).not.toContain('Goblin Boss');

    store.setState({ objects: { tokens: { goblin: { ...store.getState().objects.tokens.goblin!, isHidden: false } } } } as Partial<ViewAtlasState>);
    roll(bus, source);
    expect(doc.body.textContent).toContain('Goblin Boss');
  });

  // The portrait is the token as it stands on the presented map: its artwork
  // and its ring, as in the DM's window, not whatever its statblock pictures.
  it('shows a token with the artwork and ring it has on the map', () => {
    const { settings, doc, bus } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));

    roll(bus, { type: 'statblock', tokenId: 'wolf', tokenName: 'Wolf', abilityName: 'Bite' });
    const portrait = doc.querySelector('.atlas-token-portrait');
    expect(portrait?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
    expect(portrait?.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color')).toBe('#aa0000');
  });

  it('throws 3D dice without naming a hidden token', () => {
    const { settings, doc, bus } = setup();
    act(() => {
      settings.setDiceDisplay('full');
      settings.setLocalPlayerViewSettings({ showDiceRolls: true });
    });

    roll(bus, { type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' });
    const panel = doc.querySelector('.atlas-dice-roll');
    expect(panel?.textContent).toContain('Scimitar');
    expect(panel?.textContent).not.toContain('Goblin Boss');
    expect(doc.querySelector('.atlas-dice-toast')).toBeNull();
  });
});
