import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { EventEmitter } from 'events';
import { DiceTool, type DiceRollResult } from '../../src/app/tools/DiceTool';
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

function setup(): { settings: SettingsService; store: StoreApi<ViewAtlasState>; doc: Document } {
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
  const doc = attachFakePlayerWindow(service, { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store });
  return { settings, store, doc };
}

function roll(source?: DiceRollResult['source'], secret?: true): void {
  const result: DiceRollResult = {
    id: 'roll', timestamp: 0, formula: '1d20+4', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 4, total: 17,
    ...(source ? { source } : {}),
    ...(secret ? { secret } : {}),
  };
  act(() => { document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: result })); });
}

const toastText = (doc: Document): string | undefined => doc.querySelector('.atlas-dice-toast')?.textContent ?? undefined;

describe('player window dice rolls', () => {
  it('shows rolls only while the DM shares them', () => {
    const { settings, doc } = setup();
    roll();
    expect(toastText(doc)).toBeUndefined();

    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll();
    expect(toastText(doc)).toContain('17');

    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    expect(toastText(doc)).toBeUndefined();
  });

  it('shows no toast for a secret roll while the DM shares rolls', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll(undefined, true);
    expect(toastText(doc)).toBeUndefined();
  });

  it('still shows a roll that is not secret while the DM shares rolls', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll();
    expect(toastText(doc)).toContain('17');
  });

  it('shows only the normal roll when a secret roll came first', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll(undefined, true);
    roll();
    expect(doc.querySelectorAll('.atlas-dice-toast')).toHaveLength(1);
  });

  it('does not reveal an earlier secret roll when sharing is switched off and on', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    roll(undefined, true);
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    expect(toastText(doc)).toBeUndefined();
  });

  it('shows nothing of a roll the dice tool made secret', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    act(() => { new DiceTool(new EventEmitter()).rollDice('1d20', undefined, { secret: true }); });
    expect(toastText(doc)).toBeUndefined();
  });

  it('shows nothing of a secret roll while sharing is off', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    act(() => { new DiceTool(new EventEmitter()).rollDice('1d20', undefined, { secret: true }); });
    expect(toastText(doc)).toBeUndefined();
  });

  it('does not name a token that is hidden on the map', () => {
    const { settings, store, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    const source = { type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' } as const;

    roll(source);
    expect(toastText(doc)).toContain('Scimitar');
    expect(toastText(doc)).not.toContain('Goblin Boss');

    store.setState({ objects: { tokens: { goblin: { ...store.getState().objects.tokens.goblin!, isHidden: false } } } } as Partial<ViewAtlasState>);
    roll(source);
    expect(doc.body.textContent).toContain('Goblin Boss');
  });

  // The portrait is the token as it stands on the presented map: its artwork
  // and its ring, as in the DM's window, not whatever its statblock pictures.
  it('shows a token with the artwork and ring it has on the map', () => {
    const { settings, doc } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));

    roll({ type: 'statblock', tokenId: 'wolf', tokenName: 'Wolf', abilityName: 'Bite' });
    const portrait = doc.querySelector('.atlas-token-portrait');
    expect(portrait?.querySelector('img')?.getAttribute('src')).toContain('tokens/wolf.webp');
    expect(portrait?.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color')).toBe('#aa0000');
  });

  it('throws no 3D dice for a secret roll', () => {
    const { settings, doc } = setup();
    act(() => {
      settings.setDiceDisplay('full');
      settings.setLocalPlayerViewSettings({ showDiceRolls: true });
    });

    roll(undefined, true);
    expect(doc.querySelector('.atlas-dice-roll')).toBeNull();
  });

  it('throws 3D dice without naming a hidden token', () => {
    const { settings, doc } = setup();
    act(() => {
      settings.setDiceDisplay('full');
      settings.setLocalPlayerViewSettings({ showDiceRolls: true });
    });

    roll({ type: 'statblock', tokenId: 'goblin', tokenName: 'Goblin Boss', abilityName: 'Scimitar' });
    const panel = doc.querySelector('.atlas-dice-roll');
    expect(panel?.textContent).toContain('Scimitar');
    expect(panel?.textContent).not.toContain('Goblin Boss');
    expect(doc.querySelector('.atlas-dice-toast')).toBeNull();
  });
});
