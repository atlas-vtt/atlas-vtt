/**
 * Writing what a rest changed of every character it changed, the way the GM's own edits are written: a resource on the token it
 * was read from (one undo step per map, which `PartyReconciler` carries to the played campaign's
 * values) or else into those values (no undo step); a condition on every token of the character
 * on an open map; counters into the note through the note writer, one patch per field with the
 * value the rest read as its base. The map's steps and the note's history stay separate.
 */

import type { App } from 'obsidian';
import { PartySync } from '../campaigns/partyValues/PartySync';
import type { ResourceHolder, ResourceValue } from '../resources/resourceTypes';
import { resourceUpdate } from '../resources/resourceValues';
import { runHistoryTransaction } from '../stores/history';
import type { ViewAtlasStore } from '../storeFactory';
import { fieldPatches } from '../statblocks/editor/statblock-pane/valuePatches';
import type { FieldValue, TemplateField } from '../statblocks/model/templateTypes';
import { NoteFieldWriter } from '../statblocks/notes/NoteFieldWriter';
import type { NotePatch } from '../statblocks/notes/patchTypes';
import { readField } from '../statblocks/values/fieldValues';
import type { TokenUpdates } from '../types/viewState';
import type { CharacterRest } from './characterRest';
import type { CharacterChanges, RestOutcome } from './restTypes';

/** One Counters field to write: its patches, and the value they start from and lead to. */
export interface CounterWrite {
  readonly field: TemplateField;
  readonly patches: readonly NotePatch[];
  readonly base: FieldValue | undefined;
  readonly next: FieldValue;
}

/** Writes counters into the note; answers why it could not, or null. */
export type CounterWriter = (writes: readonly CounterWrite[]) => Promise<string | null>;

/** The note writer of the app, for the note `notePath`: every field in one write. */
export function noteCounterWriter(app: App, notePath: string): CounterWriter {
  return async (writes) => {
    const outcome = await NoteFieldWriter.forApp(app).write(notePath, writes.flatMap((write) => write.patches));
    return outcome.problem ?? (outcome.conflicts.length > 0 ? 'the note changed meanwhile.' : null);
  };
}

interface StoreWrites {
  /** Each token's resources as the rest leaves them, every changed key of it in one record. */
  resources: Map<string, ResourceHolder>;
  conditions: Array<{ tokenIds: string[]; id: string; value: number }>;
}

/** One character's part of a rest: where its values live, and what the rest changed of them. */
interface CharacterWrite {
  readonly rest: CharacterRest;
  readonly changes: CharacterChanges;
}

/** Writes the rest's resources and conditions on the maps (one undo step per map, every character's together) and into the campaign's values. */
function writeScene(app: App, parts: readonly CharacterWrite[]): void {
  const byStore = new Map<ViewAtlasStore, StoreWrites>();
  const writesOf = (store: ViewAtlasStore): StoreWrites => {
    let writes = byStore.get(store);
    if (!writes) byStore.set(store, writes = { resources: new Map(), conditions: [] });
    return writes;
  };
  for (const { rest, changes } of parts) {
    for (const [key, value] of changes.resources) {
      const place = rest.resourcePlace(key);
      if (place?.kind === 'party') {
        const sync = PartySync.forApp(app);
        sync?.setValue(place.campaignId, rest.asset.id, key, { ...sync.value(place.campaignId, rest.asset.id, key), ...value });
      } else if (place?.kind === 'token') {
        // Every token of the character on every open map, its forms' too: without a played campaign nothing else carries the value to them
        for (const { store, tokenIds } of rest.holds) {
          for (const tokenId of tokenIds) {
            const token = store.getState().objects.tokens[tokenId];
            if (!token) continue;
            // Several resources of one token: each update starts from what the ones before it left
            const writes = writesOf(store);
            const held = writes.resources.get(tokenId) ?? token;
            writes.resources.set(tokenId, { ...held, ...resourceUpdate(held, key, value, false) });
          }
        }
      }
    }
    for (const [id, value] of changes.conditions) {
      for (const { store, tokenIds } of rest.holds) writesOf(store).conditions.push({ tokenIds: [...tokenIds], id, value });
    }
  }
  for (const [store, writes] of byStore) {
    runHistoryTransaction(store, () => {
      const state = store.getState();
      const updates = [...writes.resources].map(([id, held]): { id: string; changes: TokenUpdates } => ({ id, changes: { resources: held.resources ?? {} } }));
      if (updates.length > 0) state.updateTokens(updates);
      for (const { tokenIds, id, value } of writes.conditions) state.setTokensConditionValue(tokenIds, id, value > 0 ? value : null);
    });
  }
}

/**
 * Sets resources of one character outside a rest (the note panel's − and + on a tracked number):
 * on its token on an open map as one undo step, else in the played campaign's values, as a rest writes them.
 */
export function writeCharacterResources(app: App, rest: CharacterRest, resources: ReadonlyMap<string, ResourceValue>): void {
  writeScene(app, [{ rest, changes: { resources, counters: new Map(), conditions: new Map() } }]);
}

/** Another player character a rest changed, by its id, ready to be written; null where it cannot be reached. */
export type AllyRests = (id: string) => CharacterRest | null;

const NO_ALLY_RESTS: AllyRests = () => null;

/** One character's counters, written into its note through `writeCounters`; why they could not be, or null. */
function writeCharacterCounters({ rest, changes }: CharacterWrite, writeCounters: CounterWriter): Promise<string | null> {
  const counters = [...changes.counters.values()].map(({ field, base, next }): CounterWrite => {
    const read = readField(rest.record, field);
    return { field, base, next, patches: fieldPatches(field.key, { ...read, value: base }, next) };
  });
  return counters.length > 0 ? writeCounters(counters) : Promise.resolve(null);
}

/**
 * Writes everything a rest changed, of the resting character (`rest`) and of every other one an
 * action was taken for (`allies`). The resting character's counters go through `writeCounters`
 * (the app's note writer unless given), another's through the app's note writer for its note;
 * answers why some could not be written, or null.
 */
export async function writeRest(
  app: App, rest: CharacterRest, outcome: RestOutcome, writeCounters: CounterWriter = noteCounterWriter(app, rest.notePath), allies: AllyRests = NO_ALLY_RESTS,
): Promise<string | null> {
  const parts = [...outcome.byCharacter].flatMap(([id, changes]): CharacterWrite[] => {
    const owner = id === rest.asset.id ? rest : allies(id);
    return owner ? [{ rest: owner, changes }] : [];
  });
  writeScene(app, parts);
  const problems = await Promise.all(parts.map((part) => writeCharacterCounters(part, part.rest === rest ? writeCounters : noteCounterWriter(app, part.rest.notePath))));
  return problems.find((problem) => problem !== null) ?? null;
}
