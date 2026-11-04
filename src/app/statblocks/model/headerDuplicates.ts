/**
 * Blocks of a layout that show what the header already shows (`templateHeader`):
 * a Title on the name or the display name, an Image on the token art, a Value, Line or Text bound
 * to the level, type, hit points or description and to nothing else, or one that only strings such
 * values together ("{tier} {type}"). A
 * statblock has one header, so such blocks leave the layout when a template
 * is read (written so with its next save) and when a Fantasy Statblocks layout
 * is imported. A block that works the value out (a lookup, a formula: 5E's
 * experience from the challenge, or Fantasy Statblocks code it keeps for
 * export) shows something else and stays; one that shows the value beside
 * others stays too, and the header's part hides. Pure.
 */

import { patternRefs } from '../expressions/patternRefs';
import { findCode } from './fsCodeKeys';
import { HEADER_PARTS, displayNameKey, headerKey, hitDiceKey, setHeaderPartHidden, withHeaderFields, withHeaderSettings } from './templateHeader';
import { fieldsShownBy, flattenReadingOrder } from './treeQueries';
import {
  HEADER_PART_IDS, TEMPLATE_VERSION, isContainerBlock,
  type FieldKey, type HeaderPartId, type HeaderTrack, type TrackBlock, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from './templateTypes';

/** Blocks that show one value plainly; lists, tables and scripts stay. */
const PLAIN: ReadonlySet<TemplateBlock['type']> = new Set(['title', 'line', 'stat', 'text', 'image']);
/** A pattern that filters or computes (`{cr|lookup:xp}`, `{=hp * 2}`) writes something the header does not. */
const WORKED_OUT = /[|=]/;

/** The keys whose plain blocks repeat a part: its own, and for the name the display name too. */
function repeatedKeys(fields: readonly TemplateField[], part: HeaderPartId): FieldKey[] {
  const display = part === 'name' ? displayNameKey(fields) : null;
  return [headerKey(fields, part), ...(display ? [display] : [])];
}

/** Whether a block shows the part's value as the header does: its key alone, the hit points also with their dice. */
export function showsHeaderValue(block: TemplateBlock, part: HeaderPartId, key: FieldKey, fields: readonly TemplateField[]): boolean {
  if (!PLAIN.has(block.type)) return false;
  if ('pattern' in block && block.pattern !== undefined && WORKED_OUT.test(block.pattern)) return false;
  if (findCode(block).length > 0) return false;
  const shown = new Set(fieldsShownBy(block, patternRefs));
  if (!shown.delete(key)) return false;
  const dice = hitDiceKey(fields);
  if (part === 'hp' && dice) shown.delete(dice);
  return shown.size === 0;
}

/**
 * The blocks without those `gone` names, a container they emptied going with
 * them and a top-level Side by side left with one block becoming that block.
 * The same array where nothing went.
 */
export function withoutBlocks(blocks: readonly TemplateBlock[], gone: ReadonlySet<string>, topLevel = true): TemplateBlock[] {
  let changed = false;
  const kept = blocks.flatMap((block): TemplateBlock[] => {
    if (gone.has(block.id)) {
      changed = true;
      return [];
    }
    if (!isContainerBlock(block)) return [block];
    const children = withoutBlocks(block.blocks, gone, false);
    if (children === block.blocks) return [block];
    changed = true;
    if (children.length === 0) return [];
    return topLevel && block.type === 'row' && children.length === 1 ? children : [{ ...block, blocks: children }];
  });
  return changed ? kept : (blocks as TemplateBlock[]);
}

/** Writing between a pattern's references that says nothing: spaces and punctuation. */
const ONLY_SEPARATORS = /^[\s\p{P}]*$/u;

/**
 * Whether a block strings several parts' values together and nothing else ("{tier} {type}"): the
 * header shows each, so the block repeats them all.
 */
function joinsHeaderValues(block: TemplateBlock, keys: ReadonlySet<FieldKey>): boolean {
  if (!PLAIN.has(block.type)) return false;
  const pattern = 'pattern' in block ? block.pattern : undefined;
  if (pattern === undefined || WORKED_OUT.test(pattern) || findCode(block).length > 0) return false;
  const shown = fieldsShownBy(block, patternRefs);
  return shown.length > 1 && shown.every((key) => keys.has(key)) && ONLY_SEPARATORS.test(pattern.replace(/\{[^}]*\}/g, ''));
}

/**
 * The Track the layout draws the hit points with (a row of boxes): the header draws them so instead,
 * as it draws every hit points. One holding code kept for Fantasy Statblocks stays.
 */
function trackOfHitPoints(blocks: readonly TemplateBlock[], key: FieldKey): TrackBlock | undefined {
  return blocks.find((block): block is TrackBlock => block.type === 'track' && block.field === key && findCode(block).length === 0);
}

function headerTrackOf(block: TrackBlock): HeaderTrack {
  return { look: block.look, counts: block.counts, ...(block.resource ? { resource: block.resource } : {}) };
}

/** A block an older Atlas kept off the card (`hidden: true`, read as a key this Atlas does not model). */
function wasHidden(block: TemplateBlock): boolean {
  return Object.hasOwn(block, 'hidden') && (block as unknown as Record<string, unknown>).hidden === true;
}

/** The keys the blocks show as written, beside other values ("{tier} {type}"); never through a lookup or formula. */
function plainlyShown(blocks: readonly TemplateBlock[]): Set<FieldKey> {
  const keys = new Set<FieldKey>();
  for (const block of flattenReadingOrder(blocks)) {
    if (!PLAIN.has(block.type) || ('pattern' in block && block.pattern !== undefined && WORKED_OUT.test(block.pattern))) continue;
    for (const key of fieldsShownBy(block, patternRefs)) keys.add(key);
  }
  return keys;
}

/**
 * The template without the layout's blocks that repeat a part of its header.
 * A part whose block an older Atlas kept off the card, or whose value a block
 * that stays still shows beside others, is hidden, so nothing shows twice.
 * The same template where none repeats.
 */
export function withoutHeaderDuplicates(template: StatblockTemplate): StatblockTemplate {
  if (template.version > TEMPLATE_VERSION) return template;
  const all = flattenReadingOrder(template.layout.blocks);
  const gone = new Set<string>();
  const hide = new Set<HeaderPartId>();
  for (const part of HEADER_PART_IDS) {
    for (const key of repeatedKeys(template.fields, part)) {
      for (const block of all) {
        if (!showsHeaderValue(block, part, key, template.fields)) continue;
        gone.add(block.id);
        if (wasHidden(block)) hide.add(part);
      }
    }
  }
  const hitPointsTrack = trackOfHitPoints(all, headerKey(template.fields, 'hp'));
  if (hitPointsTrack) gone.add(hitPointsTrack.id);
  const partKeys = new Set(HEADER_PART_IDS.map((part) => headerKey(template.fields, part)));
  for (const block of all) if (joinsHeaderValues(block, partKeys)) gone.add(block.id);
  if (gone.size === 0) return template;
  const blocks = withoutBlocks(template.layout.blocks, gone);
  const still = plainlyShown(blocks);
  for (const part of HEADER_PART_IDS) if (still.has(headerKey(template.fields, part))) hide.add(part);
  // The header takes the hit points the track drew, so a part an earlier read hid shows again: hidden, they would be gone.
  const tracked = hitPointsTrack
    ? setHeaderPartHidden(withHeaderSettings(template, { ...template.header, hitPoints: template.header?.hitPoints ?? headerTrackOf(hitPointsTrack) }), 'hp', false)
    : template;
  const hidden = [...hide].filter((part) => HEADER_PARTS[part].hideable)
    .reduce((current, part) => setHeaderPartHidden(current, part, true), tracked);
  return { ...hidden, layout: { ...template.layout, blocks } };
}

/**
 * A template as every reader takes it (a file, a bundle, a built-in, the JSON
 * view): a field for each part of its header, and no block that repeats one.
 * The same template where it needs neither.
 */
export function withHeader(template: StatblockTemplate): StatblockTemplate {
  return withoutHeaderDuplicates(withHeaderFields(template));
}
