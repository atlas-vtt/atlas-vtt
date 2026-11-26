// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatureIndex } from '../../../src/app/creatures/CreatureIndex';
import { openEditTokenModal } from '../../../src/app/pixi/token-renderer/EditTokenModal';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { TokenEntity } from '../../../src/app/types';
import { creatureVault, type CreatureVault } from '../../mocks/creatureVault';

const GOBLIN = 'Bestiary/Goblin.md';

let current: CreatureVault;

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  CreatureIndex.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

/** Edit token for a token with `own` speed, linked to the goblin's statblock where `statblockSpeed` is given. */
function open(own: number | undefined, statblockSpeed?: string): () => TokenEntity {
  current = creatureVault();
  if (statblockSpeed !== undefined) current.frontmatter[GOBLIN]!.speed = statblockSpeed;
  const store = createViewAtlasStore(current.app, `edit-token-speed-${Math.random()}`);
  const token = {
    id: 't', kind: 'character', name: 'Goblin', imagePath: 't.png', x: 0, y: 0,
    ...(own !== undefined && { speed: own }),
    ...(statblockSpeed !== undefined && { statblockPath: GOBLIN }),
  } as TokenEntity;
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, current.app, []));
  return () => store.getState().objects.tokens.t!;
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());
const speed = (): HTMLInputElement => screen.getByLabelText(/^Speed/) as HTMLInputElement;

describe('the speed of a token in Edit token', () => {
  it('shows the statblock\'s first speed while the token has none of its own, and saves none', async () => {
    const saved = open(undefined, '30 ft., fly 60 ft.');
    await waitFor(() => expect(speed().placeholder).toBe('Statblock default: 30'));
    expect(speed().value).toBe('');
    save();
    expect(saved().speed).toBeUndefined();
  });

  it('saves a typed speed as the token\'s own, and follows the statblock again once it is reset', async () => {
    const saved = open(undefined, '30 ft.');
    fireEvent.change(speed(), { target: { value: '45' } });
    save();
    expect(saved().speed).toBe(45);

    act(() => openEditTokenModal(saved(), createStoreOf(saved()), current.app, []));
    expect(speed().value).toBe('45');
    await waitFor(() => expect(speed().placeholder).toBe('Statblock default: 30'));
  });

  it('removes the token\'s own speed when the field is cleared with its reset button', () => {
    const saved = open(40, '30 ft.');
    expect(speed().value).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to statblock default' }));
    expect(speed().value).toBe('');
    save();
    expect(saved().speed).toBeUndefined();
  });

  it('says a token without a statblock has none, and reads a speed that is no distance as none', () => {
    const saved = open(undefined);
    expect(speed().placeholder).toBe('None');
    fireEvent.change(speed(), { target: { value: '-5' } });
    save();
    expect(saved().speed).toBeUndefined();
  });
});

/** A store that holds only `token`, for opening the dialog on a token another store saved. */
function createStoreOf(token: TokenEntity): ReturnType<typeof createViewAtlasStore> {
  const store = createViewAtlasStore(current.app, `edit-token-speed-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { [token.id]: token } } });
  return store;
}
