// @vitest-environment jsdom
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HP_RESOURCE } from '../../../../src/app/resources/resourceDefinitions';
import type { TokenVitals } from '../../../../src/app/services/statblockVitalsSync';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { withFormerKeysAliased, withoutFormerKeys } from '../../../../src/app/statblocks/resolve/fieldMeanings';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_PATH, marshText } from '../library/templateTexts';
import { NATIVE, WARDEN, renderLinked, unloadFantasyStatblocks } from '../render/linkedStatblockKit';

/** The Marsh creature's `mp` renamed to `mana`, without rewriting the notes that still hold `mp`. */
const MANA: TemplateField = { key: 'mana', label: 'Mana', type: 'number', formerKeys: ['mp'] };

let current: CreatureVault | null = null;
afterEach(() => {
  cleanup();
  if (current) TemplateLibrary.release(current.app);
  unloadFantasyStatblocks();
});

describe('a renamed field reads once', () => {
  it('leaves out the former keys an aliased record holds beside the current key', () => {
    const aliased = withFormerKeysAliased({ name: 'Warden', mp: 10, hp: 20 }, [MANA]);
    expect(aliased).toEqual({ name: 'Warden', mp: 10, mana: 10, hp: 20 });
    expect(withoutFormerKeys(aliased, [MANA])).toEqual({ name: 'Warden', mana: 10, hp: 20 });
  });

  it('keeps a former key where the current key is absent, or another field took the name, and an untouched record itself', () => {
    expect(withoutFormerKeys({ mp: 10 }, [MANA])).toEqual({ mp: 10 });
    const reused: TemplateField[] = [{ key: 'stamina', label: 'Stamina', type: 'number', formerKeys: ['hp'] }, { key: 'hp', label: 'HP', type: 'number' }];
    expect(withoutFormerKeys({ stamina: 30, hp: 12 }, reused)).toEqual({ stamina: 30, hp: 12 });
    const record = { name: 'Warden', mana: 4 };
    expect(withoutFormerKeys(record, [MANA])).toBe(record);
  });

  it('lists a renamed quantity once in the DM screen, under its current key', async () => {
    current = creatureVault();
    current.files.set(MARSH_PATH, marshText({ fields: [...MARSH_CREATURE.fields, MANA] }));
    addNote(current, WARDEN, { ...NATIVE, mp: 10 });
    const token: TokenVitals = { id: 'warden-1', name: 'Warden', imagePath: 'art/warden.webp', resources: { hp: { current: 12, max: 30 } } };
    const tokenActions = { definitions: [HP_RESOURCE], onLocateToken: vi.fn(), onUpdateToken: vi.fn() };
    const { container } = renderLinked(current, { path: WARDEN, variant: 'feed', tokens: [token], tokenActions });
    await waitFor(() => expect(container.querySelector('.atlas-sb-token-entry')).not.toBeNull());
    const labels = [...container.querySelectorAll('.atlas-sb-token-resource-label')].map((label) => label.textContent);
    expect(labels).toEqual(['HP', 'Mana']);
  });
});
