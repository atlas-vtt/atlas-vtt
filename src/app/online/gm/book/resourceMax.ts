import { matchingKey } from '../../../resources/resourceFields';
import type { ResourceDefinition, ResourceHolder } from '../../../resources/resourceTypes';
import { holdsValue } from '../../../resources/resourceValues';
import { statblockResourceValue } from '../../../resources/statblockResourceValues';
import { shownFieldsOf, type ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import { shownHeaderParts, withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateBlock } from '../../../statblocks/model/templateTypes';
import { flattenReadingOrder } from '../../../statblocks/model/treeQueries';
import { readField } from '../../../statblocks/values/fieldValues';
import { isWholeNumberText } from '../../../statblocks/values/numberText';
import type { TrackedNumber } from '../../../statblocks/values/trackedNumbers';
import { blockAccess, playerAccess } from './playerAccess.ts';

type TrackBlock = Extract<TemplateBlock, { type: 'track' }>;

/**
 * Where the maximum a player sets of their character's resource is written: into a number field of
 * their character's note (`note`), where the maximum follows it, or by hand (`hand`): the token's
 * `overriddenMax`, and the played campaign's `maxByHand` for a character no shown scene holds.
 */
export type MaxRoute = { readonly kind: 'note'; readonly field: FieldKey } | { readonly kind: 'hand' };

const BY_HAND: MaxRoute = { kind: 'hand' };

/** A number as the note stores it and a page may write back: a whole number from 0 up, or text that is one and nothing else. Anything worked out (`@level * 2`, `10+2`) is none. */
function isPlainNumber(value: FieldValue | undefined): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;
  return typeof value === 'string' && isWholeNumberText(value) && !/^\s*[+-]/.test(value);
}

/**
 * The note field `key` as the place a player writes a maximum: a number field of a native note whose
 * template reads as it was written, which the template lets players change (`playerAccess`), holding
 * a plain number. Null where it is anything else: a hidden or read-only field, a formula, no value.
 */
export function noteMaxRoute(resolved: ResolvedStatblock | null | undefined, key: FieldKey): MaxRoute | null {
  const template = resolved?.source.kind === 'atlas' && resolved.templateStatus === 'ok' ? resolved.template : null;
  if (!resolved || !template || playerAccess(template, key) !== 'edit') return null;
  const field = fieldByKey(withHeaderFields(template).fields, key);
  if (field?.type !== 'number' || !isPlainNumber(readField(resolved.fields, field).value)) return null;
  return { kind: 'note', field: field.key };
}

/** A tracked number's maximum: always its note's (`maxField`), so only where that field takes a player's number. */
export function trackedMaxRoute(resolved: ResolvedStatblock | null | undefined, tracked: Pick<TrackedNumber, 'maxField'>): MaxRoute | null {
  return noteMaxRoute(resolved, tracked.maxField);
}

/** The tracks of a template's card that show a collection resource: those of its layout, and the header's hit points drawn as one; none the player may not see. */
export function resourceTracks(template: StatblockTemplate): TrackBlock[] {
  const header = shownHeaderParts(template).flatMap((part) => (part.id === 'hp' ? [part.block] : []));
  return [...header, ...flattenReadingOrder(template.layout.blocks)]
    .filter((block): block is TrackBlock => block.type === 'track' && block.resource !== undefined && blockAccess(template, block) !== 'hidden');
}

/** Where a maximum read through a resource's field (a key of the note, never a path into a value: `stats.0`) is written: that note field, where a player may write it. */
function definitionFieldRoute(resolved: ResolvedStatblock, definition: ResourceDefinition): MaxRoute | null {
  const path = definition.field.trim();
  const key = path.includes('.') ? undefined : matchingKey(resolved.fields, path, resolved.meanings);
  return key === undefined ? null : noteMaxRoute(resolved, key);
}

/**
 * Where the maximum of a collection resource of the character is written, the one decision the
 * sheet (`maxEditable`) and a player's edit (`checkResourceEdit`) both ask, for a token in a shown
 * scene (`holder`) or a character no scene shows (none). Null where the player may not set it:
 * - a Track the template places for the resource whose field the player may not change locks it;
 * - a maximum the GM set by hand on the token stays by hand;
 * - where the character's note gives the resource its value, the field behind it is the place
 *   (`noteMaxRoute`: a plain number of a field the player may change), else nothing;
 * - a gauge the template places for a resource the token holds none of starts at its track's own
 *   number, whose field is then the place in the same way;
 * - only where no note field controls the maximum is it set by hand.
 * Undecided (null) while the note is read.
 */
export function resourceMaxRoute(resolved: ResolvedStatblock | null | undefined, definition: ResourceDefinition, holder: ResourceHolder | undefined, statblockPath: string | null): MaxRoute | null {
  if (resolved === undefined && statblockPath !== null) return null;
  const template = resolved?.source.kind === 'atlas' ? resolved.template : null;
  const track = template ? resourceTracks(template).find((block) => block.resource === definition.key) : undefined;
  if (template && track && playerAccess(template, track.field) !== 'edit') return null;
  if (holder?.overriddenMax?.includes(definition.key) === true) return BY_HAND;
  if (!resolved) return BY_HAND;
  if (statblockResourceValue(shownFieldsOf(resolved), definition, resolved.meanings) !== null) return definitionFieldRoute(resolved, definition);
  const held = holder?.resources?.[definition.key];
  if (template && track && !(held && holdsValue(definition, held)) && readField(resolved.fields, { key: track.field }).value !== undefined) return noteMaxRoute(resolved, track.field);
  return BY_HAND;
}
