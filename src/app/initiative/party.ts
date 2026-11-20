import type { TokenEntity } from '../types';
import type { CollectionSettings, PartyMember } from '../types/collectionSettingsTypes';
import type { SideId } from '../types/initiativeRulesTypes';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { sideOf } from './sides';
import { combatantColor } from './combatantColor';

/** A new entry for `addToInitiative`. */
type NewEntry = Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>;

/** The collection's party: members without an id or a name are left out, names trimmed. */
export function collectionParty(settings: Pick<CollectionSettings, 'party'> | null | undefined): PartyMember[] {
  const party: unknown = settings?.party;
  if (!Array.isArray(party)) return [];
  return party.flatMap((member: Partial<PartyMember> | null): PartyMember[] => {
    if (typeof member?.id !== 'string' || !member.id || typeof member.name !== 'string' || !member.name.trim()) return [];
    const { imagePath } = member;
    const color = combatantColor(member);
    return [{ id: member.id, name: member.name.trim(), ...(typeof imagePath === 'string' && imagePath ? { imagePath } : {}), ...(color ? { color } : {}) }];
  });
}

/** The entry's token; none for a party member, or once its token is gone. */
export function entryToken<T>(tokens: Readonly<Record<string, T>> | undefined, entry: Pick<InitiativeEntry, 'tokenId'>): T | undefined {
  return entry.tokenId === undefined ? undefined : tokens?.[entry.tokenId];
}

/** The side an entry fights on: a party member is a player, a token's side is the token's (`sideOf`, of the `known` sides). */
export function entrySide(entry: Pick<InitiativeEntry, 'tokenId' | 'partyMemberId'>, tokens: Readonly<Record<string, TokenEntity>> | undefined, known?: readonly SideId[]): SideId {
  return entry.partyMemberId ? 'players' : sideOf(entryToken(tokens, entry), known);
}

/** The members of `party` not yet in the tracker, as entries: players roll their number themselves. */
export function missingPartyEntries(party: readonly PartyMember[], entries: readonly InitiativeEntry[]): NewEntry[] {
  const inTracker = new Set(entries.map((entry) => entry.partyMemberId));
  return party
    .filter((member) => !inTracker.has(member.id))
    .map((member) => ({
      partyMemberId: member.id, name: member.name, imagePath: member.imagePath ?? '', initiative: 0, initiativeModifier: 0, isNPC: false,
      ...(member.color ? { color: member.color } : {}),
    }));
}

/** What an entry must change to show its party member as the roster has them now (name, picture, colour); nothing for a member that left. */
export function partyEntryChanges(entry: InitiativeEntry, party: readonly PartyMember[]): Partial<InitiativeEntry> | null {
  const member = entry.partyMemberId === undefined ? undefined : party.find(({ id }) => id === entry.partyMemberId);
  if (!member) return null;
  const imagePath = member.imagePath ?? '';
  if (entry.name === member.name && entry.imagePath === imagePath && entry.color === member.color) return null;
  return { name: member.name, imagePath, color: member.color };
}
