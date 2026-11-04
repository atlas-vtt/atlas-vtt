import { clampValue } from '../../resources/resourceValues';
import type { TokenEntity } from '../../types';
import { partyKey, readPartyKey, samePartyValue, type PartyKey, type PartyValue, type PartyValues } from './partyKeys';

type Tokens = Readonly<Record<string, TokenEntity>>;

/** Which campaign's values a store follows, and which tokens are its player characters. */
export interface PartyContext {
  readonly campaignId: string;
  /** The library token id of the player character a token was placed from; null for any other token. */
  readonly characterOf: (token: TokenEntity) => string | null;
}

/** The part of a store's state the party is reconciled with. */
export interface PartyScene {
  readonly tokens: Tokens;
  readonly partyValues: PartyValues;
}

/** What a pass writes: tokens whose values change (whole), and party values that change. Empty when nothing does. */
export interface PartyWrite {
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  readonly party: Readonly<Record<PartyKey, PartyValue>>;
}

/** A character's values, by resource key. */
type CharacterValues = Map<string, PartyValue>;

/** The campaign's values, by character. */
function indexOf(party: PartyValues, campaignId: string): Map<string, CharacterValues> {
  const characters = new Map<string, CharacterValues>();
  for (const [key, value] of Object.entries(party)) {
    const parts = readPartyKey(key);
    if (parts?.campaignId !== campaignId) continue;
    let values = characters.get(parts.characterId);
    if (!values) characters.set(parts.characterId, (values = new Map<string, PartyValue>()));
    values.set(parts.resourceKey, value);
  }
  return characters;
}

/** The value a token holds of `key`, as the party keeps it; undefined when it holds none. */
export function tokenPartyValue(token: TokenEntity, key: string): PartyValue | undefined {
  const value = token.resources?.[key];
  if (!value) return undefined;
  const byHand = token.overriddenMax?.includes(key) === true;
  return { current: value.current, max: value.max, ...(byHand && { maxByHand: true as const }) };
}

/**
 * The token with the party's `values`: the current value, and the maximum where it was set by
 * hand (else the token keeps its own, which its statblock gives it, and takes the party's only
 * for a value it holds none of). The same token when nothing changes.
 */
export function withPartyValues(token: TokenEntity, values: Iterable<[string, PartyValue]>): TokenEntity {
  let resources = token.resources;
  const overridden = new Set(token.overriddenMax ?? []);
  let overrideChanged = false;
  for (const [key, value] of values) {
    const own = resources?.[key];
    const next = clampValue({ current: value.current, max: value.maxByHand === true || !own ? value.max : own.max });
    if (!own || own.current !== next.current || own.max !== next.max) resources = { ...resources, [key]: next };
    if ((value.maxByHand === true) !== overridden.has(key)) {
      overrideChanged = true;
      if (value.maxByHand === true) overridden.add(key);
      else overridden.delete(key);
    }
  }
  if (resources === token.resources && !overrideChanged) return token;
  const next: TokenEntity = { ...token, ...(resources && { resources }) };
  if (overrideChanged) {
    if (overridden.size > 0) next.overriddenMax = [...overridden];
    else delete next.overriddenMax;
  }
  return next;
}

/** Collects a pass's writes against the scene it started from. */
class PassWrites {
  readonly tokens: Record<string, TokenEntity> = {};
  readonly party: Record<PartyKey, PartyValue> = {};

  constructor(private readonly scene: PartyScene, private readonly context: PartyContext) {}

  token(id: string): TokenEntity | undefined {
    return this.tokens[id] ?? this.scene.tokens[id];
  }

  /** Sets the party's value unless it holds that one already. */
  setValue(characterId: string, resourceKey: string, value: PartyValue): void {
    const key = partyKey(this.context.campaignId, characterId, resourceKey);
    if (samePartyValue(this.party[key] ?? this.scene.partyValues[key], value)) return;
    this.party[key] = value;
  }

  /** The token takes `values`. */
  take(id: string, values: Iterable<[string, PartyValue]>): void {
    const token = this.token(id);
    if (!token) return;
    const next = withPartyValues(token, values);
    if (next !== token) this.tokens[id] = next;
  }

  result(): PartyWrite {
    return { tokens: this.tokens, party: this.party };
  }
}

/** The player characters' tokens, in the store's order, with the character each stands for. */
function characterTokens(tokens: Tokens, context: PartyContext): [string, string][] {
  return Object.entries(tokens).flatMap(([id, token]): [string, string][] => {
    const characterId = context.characterOf(token);
    return characterId === null ? [] : [[id, characterId]];
  });
}

/** Adds to `index` and `writes` every value `token` holds that its character's values lack. */
function adopt(writes: PassWrites, index: Map<string, CharacterValues>, characterId: string, token: TokenEntity): void {
  let values = index.get(characterId);
  if (!values) index.set(characterId, (values = new Map<string, PartyValue>()));
  for (const key of Object.keys(token.resources ?? {})) {
    if (values.has(key)) continue;
    const value = tokenPartyValue(token, key)!;
    values.set(key, value);
    writes.setValue(characterId, key, value);
  }
}

/**
 * Every player character's token takes its character's values. With `adoptMissing` (a scene
 * loaded, a campaign that starts to keep values), what a token holds that the party lacks is
 * adopted first, from the first token that holds it, so the numbers the GM had stay.
 */
export function settleTokens(scene: PartyScene, context: PartyContext, adoptMissing: boolean): PartyWrite {
  const writes = new PassWrites(scene, context);
  const index = indexOf(scene.partyValues, context.campaignId);
  const placed = characterTokens(scene.tokens, context);
  if (adoptMissing) for (const [id, characterId] of placed) adopt(writes, index, characterId, scene.tokens[id]!);
  for (const [id, characterId] of placed) writes.take(id, index.get(characterId) ?? []);
  return writes.result();
}

/** The keys whose value, or whether its maximum was set by hand, differ between two states of a token; keys it no longer holds are left out. */
function editedKeys(before: TokenEntity, after: TokenEntity): string[] {
  if (before.resources === after.resources && before.overriddenMax === after.overriddenMax) return [];
  const held = Object.keys(after.resources ?? {});
  return held.filter((key) => !samePartyValue(tokenPartyValue(before, key), tokenPartyValue(after, key)));
}

/** Per character, the keys whose party value changed between two states of the party. */
function changedValues(before: PartyValues, after: PartyValues, campaignId: string): Map<string, Set<string>> {
  const changed = new Map<string, Set<string>>();
  if (before === after) return changed;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (samePartyValue(before[key], after[key])) continue;
    const parts = readPartyKey(key);
    if (parts?.campaignId !== campaignId) continue;
    let keys = changed.get(parts.characterId);
    if (!keys) changed.set(parts.characterId, (keys = new Set<string>()));
    keys.add(parts.resourceKey);
  }
  return changed;
}

/**
 * What a write that was no undo or redo asks of the party: a player character's token the write
 * edited gives its edited values to the party and to its character's other tokens; a token new to
 * the scene adopts into the party what it lacks and takes the rest; values that reached the party
 * from elsewhere (another view, another device) reach the character's tokens.
 */
export function followWrite(before: PartyScene, after: PartyScene, context: PartyContext): PartyWrite {
  const writes = new PassWrites(after, context);
  // Read only when a value moves: a drag frame reads none.
  let known: Map<string, CharacterValues> | null = null;
  const index = (): Map<string, CharacterValues> => (known ??= indexOf(after.partyValues, context.campaignId));
  const toTake = changedValues(before.partyValues, after.partyValues, context.campaignId);
  const fresh = new Set<string>();
  const taking = (characterId: string): Set<string> => {
    let keys = toTake.get(characterId);
    if (!keys) toTake.set(characterId, (keys = new Set<string>()));
    return keys;
  };

  // Only tokens the write replaced can have been edited or added: a drag frame looks at one.
  if (before.tokens !== after.tokens) {
    for (const [id, token] of Object.entries(after.tokens)) {
      const previous = before.tokens[id];
      if (previous === token) continue;
      const characterId = context.characterOf(token);
      if (characterId === null) continue;
      if (!previous || context.characterOf(previous) !== characterId) {
        adopt(writes, index(), characterId, token);
        fresh.add(id);
        continue;
      }
      for (const key of editedKeys(previous, token)) {
        const value = tokenPartyValue(token, key)!;
        let values = index().get(characterId);
        if (!values) index().set(characterId, (values = new Map<string, PartyValue>()));
        values.set(key, value);
        writes.setValue(characterId, key, value);
        taking(characterId).add(key);
      }
    }
  }
  if (toTake.size === 0 && fresh.size === 0) return writes.result();

  for (const [id, characterId] of characterTokens(after.tokens, context)) {
    const values = index().get(characterId);
    if (!values) continue;
    const keys = fresh.has(id) ? [...values.keys()] : [...(toTake.get(characterId) ?? [])];
    writes.take(id, keys.flatMap((key): [string, PartyValue][] => (values.has(key) ? [[key, values.get(key)!]] : [])));
  }
  return writes.result();
}

/** Whether a pass writes nothing. */
export const isEmptyWrite = (write: PartyWrite): boolean => Object.keys(write.tokens).length === 0 && Object.keys(write.party).length === 0;
