// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { TokenVision } from '../../src/app/types/lightingTypes';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

const GOBLIN = 'Bestiary/Goblin.md';
const sense = (name: string): string => GENERIC_SENSES.find((candidate) => candidate.name === name)!.id;

let current: CreatureVault;

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  CreatureIndex.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

/** Edit Token for a token linked to the goblin's statblock, whose senses line is `senses`. */
function open(senses: string | undefined, vision: TokenVision = { enabled: true }, linked = true): () => TokenEntity {
  current = creatureVault();
  if (senses !== undefined) current.frontmatter[GOBLIN]!.senses = senses;
  const store = createViewAtlasStore(current.app, `edit-token-statblock-${Math.random()}`);
  const token = { id: 't', kind: 'character', name: 'Goblin', imagePath: 't.png', x: 0, y: 0, vision, ...(linked && { statblockPath: GOBLIN }) } as TokenEntity;
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, current.app, []));
  return () => store.getState().objects.tokens.t!;
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());
const rows = (): HTMLElement[] => screen.queryAllByRole('listitem');
const sightRange = (): HTMLInputElement => screen.getByLabelText(/^Sight range/) as HTMLInputElement;

describe('Edit Token for a token with a linked statblock', () => {
  it('shows the statblock\'s senses once it is read, tagged, and saves none while they are not edited', async () => {
    const saved = open('darkvision 60 ft., tremorsense 30 ft., passive Perception 9');
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(within(rows()[0]!).getByText('Darkvision')).toBeTruthy();
    expect(within(rows()[0]!).getByText('60 ft')).toBeTruthy();
    for (const row of rows()) expect(within(row).getByText('from statblock')).toBeTruthy();
    expect(screen.queryByText(/^Not recognised/)).toBeNull();
    save();
    expect(saved().vision).toEqual({ enabled: true });
  });

  it('says in a line what of the statblock\'s senses it does not recognise, without its perception score', async () => {
    open('darkvision 60 ft., keen smell, echo sight 20 ft., passive Perception 9');
    await waitFor(() => expect(screen.getByText('Not recognised: keen smell, echo sight 20 ft.')).toBeTruthy());
    expect(rows()).toHaveLength(1);
  });

  it('copies the statblock\'s senses onto the token once they are edited', async () => {
    const saved = open('darkvision 60 ft.');
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Edit senses' }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '90' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: sense('Darkvision'), range: 90 }] });
  });

  it('shows how far a creature that is blind beyond its senses sees, as the sight range it has without one of its own', async () => {
    const saved = open('blindsight 30 ft. (blind beyond this radius), passive Perception 10');
    await waitFor(() => expect(sightRange().placeholder).toBe('30, from statblock'));
    expect(sightRange().value).toBe('');
    save();
    expect(saved().vision).toEqual({ enabled: true });
  });

  it('says that a creature without eyes has no sight, and keeps the token\'s own range where it has one', async () => {
    open('tremorsense 60 ft. (blind beyond this radius)', { enabled: true, range: 45 });
    await waitFor(() => expect(sightRange().placeholder).toBe('None, from statblock'));
    expect(sightRange().value).toBe('45');
  });

  it('tags the rows of a token with senses of its own that still equal the statblock, and lets it follow again', async () => {
    const saved = open('darkvision 60 ft.', { enabled: true, senses: [{ id: sense('Darkvision'), range: 60 }, { id: sense('Blindsight'), range: 10 }] });
    await waitFor(() => expect(within(rows()[0]!).getByText('from statblock')).toBeTruthy());
    expect(within(rows()[1]!).queryByText('from statblock')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Follow statblock' }));
    save();
    expect(saved().vision).toEqual({ enabled: true });
  });

  it('shows nothing of a statblock for a token that links none, or whose statblock names no senses', async () => {
    open('darkvision 60 ft.', { enabled: true }, false);
    expect(rows()).toHaveLength(0);
    expect(sightRange().placeholder).toBe('Unlimited');
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    CreatureIndex.release(current.app);
    open(undefined);
    await waitFor(() => expect(CreatureIndex.forApp(current.app).isPending()).toBe(false));
    expect(rows()).toHaveLength(0);
    expect(screen.queryByText(/^Not recognised/)).toBeNull();
  });
});
