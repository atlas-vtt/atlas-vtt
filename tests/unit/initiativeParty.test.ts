import { describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { collectionParty, entrySide, missingPartyEntries, partyEntryChanges } from '../../src/app/initiative/party';
import type { PartyMember } from '../../src/app/types/collectionSettingsTypes';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const ARA: PartyMember = { id: 'ara', name: 'Ara', imagePath: 'party/ara.webp' };
const BOR: PartyMember = { id: 'bor', name: 'Bor' };

describe('the party at the table', () => {
  it('reads the stored party, leaving out members it cannot show', () => {
    const stored = [ARA, { id: 'x', name: '  ' }, { name: 'No id' }, null, { ...BOR, name: ' Bor ', imagePath: '' }];
    expect(collectionParty({ party: stored as PartyMember[] })).toEqual([ARA, BOR]);
    expect(collectionParty(null)).toEqual([]);
    expect(collectionParty({ party: 'not a list' as unknown as PartyMember[] })).toEqual([]);
  });

  it('adds the members not in the fight yet, as players with no number rolled', () => {
    const missing = missingPartyEntries([ARA, BOR], [{ partyMemberId: 'ara' } as never]);
    expect(missing).toEqual([{ partyMemberId: 'bor', name: 'Bor', imagePath: '', initiative: 0, initiativeModifier: 0, isNPC: false }]);
    expect(entrySide(missing[0]!, {})).toBe('players');
    // A token without vision is an opponent; a party member never needs one
    expect(entrySide({ tokenId: 'goblin' }, { goblin: {} as TokenEntity })).toBe('opponents');
  });

  it('gives a member\'s colour to their entry, and follows it as it changes', () => {
    const red = { ...ARA, color: '#dc2626' };
    expect(collectionParty({ party: [red, { ...BOR, color: 'red' }] })).toEqual([red, BOR]);
    expect(missingPartyEntries([red], [])[0]?.color).toBe('#dc2626');
    const entry = { id: 'e', partyMemberId: 'ara', name: 'Ara', imagePath: 'party/ara.webp' } as never;
    expect(partyEntryChanges(entry, [red])).toEqual({ name: 'Ara', imagePath: 'party/ara.webp', color: '#dc2626' });
    expect(partyEntryChanges({ ...(entry as object), color: '#dc2626' } as never, [red])).toBeNull();
  });

  it('keeps an entry showing its member as the roster has them, and leaves one whose member left', () => {
    const entry = { id: 'e', partyMemberId: 'ara', name: 'Old', imagePath: '' } as never;
    expect(partyEntryChanges(entry, [ARA])).toEqual({ name: 'Ara', imagePath: 'party/ara.webp' });
    expect(partyEntryChanges({ ...(entry as object), name: 'Ara', imagePath: 'party/ara.webp' } as never, [ARA])).toBeNull();
    expect(partyEntryChanges(entry, [BOR])).toBeNull();
  });

  it('rolls for the monsters only: a player keeps the number typed in, and the order follows it', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `party-${Math.random()}`);
    store.setState({ persistenceEnabled: false });
    const { addToInitiative, updateInitiativeEntry } = store.getState();
    addToInitiative({ tokenId: 'goblin', name: 'Goblin', initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
    const [ara] = missingPartyEntries([ARA], []);
    const araId = addToInitiative(ara!);
    updateInitiativeEntry(araId, { initiative: 17 });

    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    store.getState().rollAllInitiative('1d20');
    random.mockRestore();

    const entries = [...store.getState().initiative.entries].sort((a, b) => a.order - b.order);
    expect(entries.map((entry) => [entry.name, entry.initiative])).toEqual([['Ara', 17], ['Goblin', 1]]);
  });
});
