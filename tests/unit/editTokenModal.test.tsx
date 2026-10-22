// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { AMMO, ARMOR, HP } from '../mocks/resourceFixtures';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';

afterEach(() => document.body.replaceChildren());

function open(resources: NonNullable<Character['resources']>, definitions: readonly ResourceDefinition[] = [HP, AMMO]) {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `edit-token-${Math.random()}`);
  const token: Character = { id: 't1', kind: 'character', name: 'Gunner', imagePath: 'gunner.png', x: 0, y: 0, resources };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t1: token } } });
  act(() => openEditTokenModal(token, store, app, definitions));
  /** The number input under the label reading `label`. */
  const input = (label: string): HTMLInputElement =>
    screen.getByText(label).parentElement!.querySelector<HTMLInputElement>('input[type="number"]')!;
  return { input, saved: (): Character => store.getState().objects.tokens.t1 as Character };
}

describe('Edit Token resources', () => {
  it('names a static value plainly: it has no maximum, it is the value', () => {
    const { input } = open({ hp: { current: 5, max: 8 }, armor: { current: 15, max: 15 } }, [HP, ARMOR]);
    expect(input('Armor').value).toBe('15');
    expect(screen.queryByText('Max Armor')).toBeNull();
  });

  it('offers the maximum of every resource the collection defines', () => {
    const { input } = open({ hp: { current: 5, max: 8 } });
    expect(input('Max HP').value).toBe('8');
    expect(input('Max Ammo').value).toBe('');
  });

  it('gives the token a resource it did not have and remembers hand-set maxima', () => {
    const { input, saved } = open({ hp: { current: 5, max: 8 } });
    fireEvent.change(input('Max Ammo'), { target: { value: '6' } });
    fireEvent.change(input('Max HP'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved().resources).toEqual({ hp: { current: 4, max: 4 }, ammo: { current: 6, max: 6 } });
    expect(saved().overriddenMax).toEqual(['hp', 'ammo']);
  });

  it('removes a resource whose maximum was cleared when no statblock supplies one', () => {
    const { input, saved } = open({ hp: { current: 5, max: 8 }, ammo: { current: 2, max: 6 } });
    fireEvent.change(input('Max Ammo'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // HP has no statblock default either, but its field was left as it was
    expect(saved().resources).toEqual({ hp: { current: 5, max: 8 } });
  });
});
