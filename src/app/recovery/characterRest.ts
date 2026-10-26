/**
 * A player character as a rest reads it in this app: the recovery buttons its note's template
 * offers, its collection's resources and conditions, and where each of
 * its values is held now. A resource is read from the character's token on an open map (one on
 * screen first), else from the values the played campaign keeps of it; a condition from its token
 * on an open map; counters and `@` references from the note (`statblockLookup`: `@level`, `@str.mod`), where
 * the references a value itself names read only what the character's player may see. The template's tracked numbers are
 * resources too (`trackedResources`), whose maximum is always the note's and which start full or
 * empty where nothing holds them yet.
 */

import type { App } from 'obsidian';
import { CampaignPlay } from '../campaigns/campaignPlay';
import { PartySync } from '../campaigns/partyValues/PartySync';
import { characterOf, libraryTokenOf } from '../characters/playerCharacters';
import { playerCharacterOfNote } from '../characters/noteCharacter';
import { shownRecord } from '../online/gm/book/playerAccess.ts';
import { collectionResources } from '../resources/collectionResources';
import { resourceOfField, trackedResources } from '../resources/trackedResources';
import type { ResourceValue } from '../resources/resourceTypes';
import { AssetService, type TokenAsset } from '../services/AssetService';
import { openMapViews } from '../services/collectionScenes';
import type { ViewAtlasStore } from '../storeFactory';
import { withHeaderFields } from '../statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateId } from '../statblocks/model/templateTypes';
import { NoteSource } from '../statblocks/notes/noteSource';
import { frontmatterSource } from '../statblocks/notes/statblockSource';
import { libraryTemplates } from '../statblocks/resolve/readStatblock';
import { resolveNative } from '../statblocks/resolve/resolveStatblock';
import { readField, type FieldRecord } from '../statblocks/values/fieldValues';
import { statblockLookup, statblockLookupWith } from '../statblocks/values/statblockLookup';
import { withReferencesFilled } from '../statblocks/values/fillReferences';
import { trackedMax, trackedValue } from '../statblocks/values/trackedNumbers';
import { conditionValue } from '../utils/conditionValues';
import type { RecoveryButton } from './recoveryTypes';
import type { RestCharacter } from './restTypes';

/** A template without recovery buttons offers none. */
const NO_BUTTONS: readonly RecoveryButton[] = [];

/** The character's tokens on one open map. */
export interface TokenHold {
  readonly store: ViewAtlasStore;
  readonly tokenIds: readonly string[];
}

/** Where a resource's value was read, and so is written: a token on an open map, or the played campaign's values. */
export type ResourcePlace =
  | { readonly kind: 'token'; readonly store: ViewAtlasStore; readonly tokenId: string }
  | { readonly kind: 'party'; readonly campaignId: string };

/** A player character ready to rest: its buttons, what the engine reads of it, and where its values live. */
export interface CharacterRest {
  /** The library token that is the character. */
  readonly asset: TokenAsset;
  readonly notePath: string;
  readonly templateId: TemplateId;
  readonly template: StatblockTemplate;
  /** The note's values the rest was read from. */
  readonly record: FieldRecord;
  readonly buttons: readonly RecoveryButton[];
  readonly character: RestCharacter;
  /** The character's tokens on every open map, the one on screen first. */
  readonly holds: readonly TokenHold[];
  /** Where each resource the character holds was read. */
  resourcePlace(key: string): ResourcePlace | null;
}

/** The note a character's statblock is, as the pane or the note source reads it. */
export interface RestNote {
  readonly notePath: string;
  readonly templateId: TemplateId;
  readonly template: StatblockTemplate;
  readonly record: FieldRecord;
}

/** The character's tokens on each open, loaded map of the GM, a map on screen first. */
function characterHolds(app: App, asset: TokenAsset): TokenHold[] {
  const library = AssetService.getInstance(app).loadedTokenAssets();
  const views = openMapViews(app).sort((a, b) => Number(b.containerEl.isShown()) - Number(a.containerEl.isShown()));
  return views.flatMap((view) => {
    const store = view.getStore();
    const state = store.getState();
    if (!state.mapLoaded || state.isMapLoading) return [];
    // Every form of the character: tokens placed from any library token that is one of its forms
    const tokenIds = Object.values(state.objects.tokens).filter((token) => {
      const record = libraryTokenOf(token, library);
      return record !== null && characterOf(record, library)?.id === asset.id;
    }).map((token) => token.id);
    return tokenIds.length > 0 ? [{ store, tokenIds }] : [];
  });
}

/** The first of the character's tokens that holds the resource. */
function tokenHolding(holds: readonly TokenHold[], key: string): { store: ViewAtlasStore; tokenId: string; value: ResourceValue } | null {
  for (const { store, tokenIds } of holds) {
    const tokens = store.getState().objects.tokens;
    for (const tokenId of tokenIds) {
      const value = tokens[tokenId]?.resources?.[key];
      if (value) return { store, tokenId, value };
    }
  }
  return null;
}

/** The character `asset` resting with its note `note`, as this app holds it now. */
export function characterRestOf(app: App, asset: TokenAsset, note: RestNote): CharacterRest {
  const settings = AssetService.getInstance(app).getCollectionSettings(asset.collection);
  const buttons = note.template.recovery ?? NO_BUTTONS;
  const holds = characterHolds(app, asset);
  const sync = PartySync.forApp(app);
  const campaignId = CampaignPlay.forApp(app).playing();
  // What a player wrote into a value names only what they may see, here as on their sheet: a rest
  // that reads it must not fill it from a field hidden from them, since its player is shown the rest
  const shownFields = withHeaderFields(note.template).fields;
  const playerSees = statblockLookup(note.template, shownRecord(note.record, note.template, shownFields), shownFields);
  const lookup = statblockLookupWith(note.template, note.record, note.template.fields, playerSees);
  const fields = new Map(note.template.fields.map((field) => [field.key, field]));

  const collection = collectionResources(settings);
  const tracked = new Map(trackedResources(note.template, collection).map((each) => [each.definition.key, each]));
  const readIn = (record: FieldRecord) => (key: string): ReturnType<typeof readField>['value'] => {
    const field = fields.get(key);
    return field ? readField(record, field).value : undefined;
  };
  // What the note holds, which counter writes take as their base
  const read = readIn(note.record);
  // Numbers as the card shows them: a maximum written `@level` or `10 + @con.mod` is a number
  const readShown = readIn(withReferencesFilled(note.record, note.template.fields, playerSees));

  const partyValue = (key: string): ResourceValue | undefined => {
    const party = sync && campaignId !== null ? sync.value(campaignId, asset.id, key) : undefined;
    return party && { current: party.current, max: party.max };
  };

  const heldValue = (key: string): ResourceValue | undefined => tokenHolding(holds, key)?.value ?? partyValue(key);

  const resourcePlace = (key: string): ResourcePlace | null => {
    const token = tokenHolding(holds, key);
    if (token) return { kind: 'token', store: token.store, tokenId: token.tokenId };
    if (campaignId !== null && partyValue(key)) return { kind: 'party', campaignId };
    if (!tracked.has(key)) return null;
    // A tracked number nothing holds yet goes where the character's resources are kept
    const first = holds[0];
    if (first) return { kind: 'token', store: first.store, tokenId: first.tokenIds[0]! };
    return campaignId !== null && sync ? { kind: 'party', campaignId } : null;
  };

  const resourceValue = (key: string): ResourceValue | undefined => {
    const number = tracked.get(key)?.tracked;
    if (!number) return heldValue(key);
    const max = trackedMax(number, readShown);
    return max === null ? undefined : trackedValue(number, max, heldValue(key));
  };

  const character: RestCharacter = {
    id: asset.id,
    name: asset.name,
    resources: [...collection, ...[...tracked.values()].map((each) => each.definition)],
    // A static resource is found too: the rest then says it changes none
    resourceOf: resourceOfField(note.template, collection, true),
    conditions: settings.conditions ?? [],
    fields,
    resourceValue,
    conditionValue: (id) => {
      const first = holds[0];
      const token = first && first.store.getState().objects.tokens[first.tokenIds[0]!];
      if (!token) return null;
      return (token.conditions ?? []).includes(id) ? conditionValue(token, id) : 0;
    },
    fieldValue: read,
    lookup,
  };
  return { asset, ...note, buttons, character, holds, resourcePlace };
}

/**
 * The player character whose statblock is the native note at `notePath`, ready to rest, read from
 * the note as an open editor or the metadata cache holds it; null where no player character links
 * the note or it is no native statblock.
 */
export function characterRest(app: App, notePath: string): CharacterRest | null {
  const asset = playerCharacterOfNote(app, notePath);
  const record = NoteSource.forApp(app).read(notePath).frontmatter;
  const source = frontmatterSource(record);
  if (!asset || !record || source?.kind !== 'atlas') return null;
  const resolved = resolveNative(notePath, source, record, libraryTemplates(app));
  if (!resolved.template) return null;
  return characterRestOf(app, asset, { notePath, templateId: source.templateId, template: resolved.template, record });
}
