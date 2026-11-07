import type { BookResourceMessage } from '../../protocol/index.ts';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from '../../../resources/resourceTypes';
import { trackedResources } from '../../../resources/trackedResources';
import { clampValue, holdsValue } from '../../../resources/resourceValues';
import { visibleResources } from '../../../resources/visibleResources';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { BookScene } from './bookScene.ts';
import type { PlayedCharacter } from './characters.ts';
import { resourceMaxRoute, trackedMaxRoute, type MaxRoute } from './resourceMax.ts';

/** A maximum a player sets, where it is written (`MaxRoute`), and whether it is a fixed value's one number (`static`). */
export interface MaxEdit {
  readonly value: number;
  readonly route: MaxRoute;
  readonly fixed: boolean;
}

/**
 * A player's edit of their own character's resource, checked: written to the token in the shared
 * scene (`token`), or, while that scene holds no token of the character, to the values the played
 * campaign keeps of it (`character`). `current` is as the player sent it; the writer clamps it to
 * the value it writes over. A number the character's statblock tracks carries the value its sheet
 * offered (`tracked`): its maximum is the note's, and where nothing holds it yet it starts there.
 * With `max` the player set the maximum too; a maximum of the note (`route.kind === 'note'`) is
 * written there, and the token or the campaign take it as their own only by hand.
 */
export type ResourceEdit =
  | { readonly kind: 'token'; readonly from: string; readonly tokenId: string; readonly key: string; readonly current: number; readonly tracked?: ResourceValue; readonly max?: MaxEdit }
  | { readonly kind: 'character'; readonly from: string; readonly placed: PlacedTokenSource; readonly key: string; readonly current: number; readonly tracked?: ResourceValue; readonly max?: MaxEdit };

/**
 * The value a player may change of their own character's resource: one its token holds
 * (`visibleResources` for the viewer `owner`) that is no fixed value (`withMax`: or is, where its
 * maximum is set), or a tracked number (`tracked`: as its sheet offered it), with what the token
 * holds of it. Null for any other key.
 */
export function editableValue(token: ResourceHolder, definitions: readonly ResourceDefinition[], key: string, tracked?: ResourceValue, withMax = false): ResourceValue | null {
  if (tracked) return { current: token.resources?.[key]?.current ?? tracked.current, max: tracked.max };
  const shown = visibleResources(token, definitions, 'owner').find(({ definition }) => definition.key === key);
  return shown === undefined || (shown.definition.direction === 'static' && !withMax) ? null : shown.value;
}

/** A value with the maximum a player set: its current value kept within it, a fixed value (`fixed`) that number alone. */
export function withMaxValue(value: ResourceValue, current: number, max: number, fixed: boolean): ResourceValue {
  return clampValue({ current: fixed ? max : Number.isFinite(current) ? current : value.current, max });
}

/** Where the maximum of the number the character's note tracks under `key` is written; null where it tracks none or the player may not set it. */
function trackedNumberRoute(resolved: ResolvedStatblock | null | undefined, definitions: readonly ResourceDefinition[], key: string): MaxRoute | null {
  const template = resolved?.source.kind === 'atlas' ? resolved.template : null;
  const number = template ? trackedResources(template, definitions).find((each) => each.definition.key === key) : undefined;
  return number === undefined ? null : trackedMaxRoute(resolved, number.tracked);
}

/** What a player asks of a resource besides its current value: where its maximum goes, or null where they may not set it. */
function maxEditOf(
  message: BookResourceMessage, character: PlayedCharacter, definitions: readonly ResourceDefinition[], token: BookScene['tokens'][string] | undefined, resolved: ResolvedStatblock | null | undefined,
): MaxEdit | null | undefined {
  if (message.max === undefined) return undefined;
  const definition = definitions.find((each) => each.key === message.key);
  const fixed = definition?.direction === 'static';
  // A counting value needs a maximum above 0, a fixed value (an armour class) may be 0
  if (message.max < (fixed ? 0 : 1)) return null;
  // The same decision as the sheet's, for a token the scene holds (with or without a value of it) and a character no scene shows
  const route = definition === undefined ? trackedNumberRoute(resolved, definitions, message.key) : resourceMaxRoute(resolved, definition, token, character.statblockPath);
  return route === null ? null : { value: message.max, route, fixed };
}

/**
 * Whether a player may make an edit, and where it goes; null when it is refused. The player must
 * play a character whose last sheet offers the resource for editing (its maximum, where they set
 * one). While the shared scene holds the character's token, that token must still be theirs and the
 * resource one they may change there; otherwise the edit is for the character's values. `resolved`
 * is the character's note as it is drawn now, which says where a maximum is written.
 */
export function checkResourceEdit(
  from: string, character: PlayedCharacter | null, scene: BookScene | null, ownerOf: (tokenId: string) => string | undefined, message: BookResourceMessage,
  resolved?: ResolvedStatblock | null,
): ResourceEdit | null {
  const asked = message.max === undefined ? 'editable' : 'maxEditable';
  const offered = character?.sheet.resources.find((resource) => resource.key === message.key && resource[asked]);
  if (character === null || offered === undefined) return null;
  const { key, current } = message;
  const token = scene === null ? undefined : scene.tokens[character.tokenId];
  // No resource of the collection (a number the statblock tracks), or one the token holds no value of
  // (a gauge its template places): it starts at the value its sheet offered, where nothing holds one
  const definitions = scene?.resources ?? character.drawnWith.definitions;
  const definition = definitions.find((each) => each.key === key);
  const holding = token?.resources?.[key];
  const tracked = definition !== undefined && holding !== undefined && holdsValue(definition, holding) ? undefined : { current: offered.current, max: offered.max };
  const max = maxEditOf(message, character, definitions, token, resolved);
  if (max === null) return null;
  const extra = { ...(tracked && { tracked }), ...(max && { max }) };
  if (scene === null || token === undefined) return { kind: 'character', from, placed: character.placed, key, current, ...extra };
  if (ownerOf(character.tokenId) !== from || (!tracked && editableValue(token, scene.resources, key, undefined, max !== undefined) === null)) return null;
  return { kind: 'token', from, tokenId: character.tokenId, key, current, ...extra };
}
