// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatureIndex } from '../../../../src/app/creatures/CreatureIndex';
import { openEditTokenModal } from '../../../../src/app/pixi/token-renderer/EditTokenModal';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import type { Character } from '../../../../src/app/types';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { HP } from '../../../mocks/resourceFixtures';

const GUARD = 'Bestiary/Iron Guard.md';
/** A Draw Steel monster: its hit points are its Stamina. */
const IRON_GUARD = { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Iron Guard', level: 3, stamina: 30 };

let current: CreatureVault;

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  CreatureIndex.release(current.app);
  TemplateLibrary.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

/** Edit Token for a token linked to the Iron Guard, whose HP resource reads the field `hp`. */
function open(token: Partial<Character>): { saved: () => Character; maxHp: () => HTMLInputElement } {
  current = creatureVault();
  addNote(current, GUARD, IRON_GUARD);
  const store = createViewAtlasStore(current.app, `edit-token-native-${Math.random()}`);
  const placed: Character = { id: 't', kind: 'character', name: 'Iron Guard', imagePath: 't.png', x: 0, y: 0, statblockPath: GUARD, ...token };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: placed } } });
  act(() => openEditTokenModal(placed, store, current.app, [HP]));
  return {
    saved: () => store.getState().objects.tokens.t as Character,
    maxHp: () => screen.getByText('Max HP').parentElement!.querySelector<HTMLInputElement>('input[type="number"]')!,
  };
}

describe('Edit Token reads its statblock defaults through the resolver', () => {
  it('offers the hit points a native template keeps under another key', async () => {
    const { maxHp } = open({ resources: { hp: { current: 30, max: 30 } } });
    await waitFor(() => expect(maxHp().placeholder).toBe('Statblock default: 30'));
  });

  it('follows the statblock again when a hand-set maximum is cleared, keeping what was spent', async () => {
    const { saved, maxHp } = open({ resources: { hp: { current: 12, max: 50 } }, overriddenMax: ['hp'] });
    await waitFor(() => expect(maxHp().placeholder).toBe('Statblock default: 30'));
    fireEvent.change(maxHp(), { target: { value: '' } });
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    expect(saved().resources).toEqual({ hp: { current: 12, max: 30 } });
    expect(saved().overriddenMax).toBeUndefined();
  });
});
