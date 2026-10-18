import { isExpressionError } from '../../../statblocks/expressions/errors';
import { parsePatternCached } from '../../../statblocks/expressions/patternParse';
import { abilityFieldKeys } from '../../../statblocks/model/abilityParts';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import { keysShownBy } from '../../../statblocks/model/fieldOps';
import { defaultPlayerAccess } from '../../../statblocks/model/playerSettings';
import { displayNameKey, headerKey } from '../../../statblocks/model/templateHeader';
import { flattenReadingOrder } from '../../../statblocks/model/treeQueries';
import {
  isContainerBlock, isPlayerAccess, type FieldKey, type LineBlock, type PlayerAccess, type StatBlock, type StatblockTemplate, type TemplateBlock, type TemplateField, type TitleBlock,
} from '../../../statblocks/model/templateTypes';

/** How much each setting lets a player do; the stricter of two wins where one block shows several fields. */
const RANK: Readonly<Record<PlayerAccess, number>> = { edit: 2, read: 1, hidden: 0 };

/** The stricter of two settings. */
export function stricter(a: PlayerAccess, b: PlayerAccess): PlayerAccess {
  return RANK[a] <= RANK[b] ? a : b;
}

/** The laxer of two settings. */
function laxer(a: PlayerAccess, b: PlayerAccess): PlayerAccess {
  return RANK[a] >= RANK[b] ? a : b;
}

/** The fields whose value a player only ever reads, whatever the template says: the name the header shows and the token art. */
function isFixedRead(template: StatblockTemplate, field: TemplateField): boolean {
  const fixed = [headerKey(template.fields, 'name'), headerKey(template.fields, 'token'), displayNameKey(template.fields)];
  return fixed.includes(field.key) || field.type === 'image';
}

/**
 * The setting the template stores for a field: under its key, else under one it had before a rename,
 * newest first. A setting this Atlas does not know (of a newer one) is read as `hidden`, so a
 * stricter setting it cannot read never shows a field.
 */
function storedAccess(template: StatblockTemplate, field: TemplateField): PlayerAccess | undefined {
  const players = template.players;
  if (!players) return undefined;
  for (const key of [field.key, ...(field.formerKeys ?? [])]) {
    if (!Object.hasOwn(players, key)) continue;
    const stored = players[key];
    return isPlayerAccess(stored) ? stored : 'hidden';
  }
  return undefined;
}

/**
 * What a player may do with one field of their own character's statblock. By default they change
 * every value, and every ability of a list; a spell list in Fantasy Statblocks' shape they only read
 * (or not at all); the name and the token art they always read. A template stores only where it
 * differs from that (`StatblockTemplate.players`). A key the template names nowhere is hidden: the
 * note may hold anything, and a player gets only what the template shows.
 */
export function playerAccess(template: StatblockTemplate, key: FieldKey): PlayerAccess {
  const field = fieldByKey(template.fields, key);
  if (!field) return 'hidden';
  if (isFixedRead(template, field)) return 'read';
  const stored = storedAccess(template, field);
  if (field.type === 'spells') return stored === 'hidden' ? 'hidden' : 'read';
  return stored ?? defaultPlayerAccess(field);
}

/**
 * Whether a block's text reads a field the player may not see: its own fields, the fields its
 * pattern and its fallback refer to, a Stat's `rollFrom`, a list's intro, a Section's heading
 * field, and what a Table's worked-out rows read. Its condition (`showWhen`) is not among them:
 * the GM works it out, and only whether the block shows reaches the player.
 */
export function readsHiddenField(template: StatblockTemplate, block: TemplateBlock): boolean {
  return keysShownBy(block).some((key) => playerAccess(template, key) === 'hidden');
}

/** Whether a pattern writes one field as it holds it and nothing else (`{hp}`): no text, filter, lookup, formula or other field. */
function writesOnly(pattern: string, key: FieldKey): boolean {
  const ast = parsePatternCached(pattern);
  if (isExpressionError(ast) || ast.nodes.length !== 1) return false;
  const [node] = ast.nodes;
  return node?.kind === 'refs' && node.filters.length === 0 && node.refs.length === 1 && node.refs[0] === key;
}

/**
 * Whether a Title, Line or Stat shows one field's own value, which the player may then change: a
 * Line of several fields, or a pattern that works its text out (a lookup, a formula, text around
 * the value), shows something else, and offering the field would put its raw value in its place.
 */
function showsOwnValue(block: TitleBlock | LineBlock | StatBlock): boolean {
  const key = block.type === 'line' ? (block.fields.length === 1 ? block.fields[0] : undefined) : block.field;
  return key !== undefined && (block.pattern === undefined || writesOnly(block.pattern, key));
}

/**
 * What a player may do with what a block shows. A block whose text reads a hidden field
 * (`readsHiddenField`) is hidden whole. An Abilities component (a list, or a list split into tabs)
 * is set for all its lists at once, so the strictest of them decides; a Track bound to a token
 * resource is only read here, since the player changes it as that resource; a Title, Line or Stat
 * that shows anything but one field's own value (`showsOwnValue`) is read as worked out. A Metric shows wherever one of its numbers
 * does, each number set on its own (and a hidden one left out), unless its fallback reads a hidden
 * field. A container is read: what it holds is decided block by block, and a Section's heading
 * field is left out where it is hidden. Values a block works out by itself (a fallback, a Table's
 * worked-out row) have no field and are never changed.
 */
export function blockAccess(template: StatblockTemplate, block: TemplateBlock): PlayerAccess {
  if (block.type === 'script' || block.type === 'opaque') return 'hidden';
  const lists = abilityFieldKeys(block);
  if (lists.length > 0) {
    const shown = block.type === 'tabs' ? flattenReadingOrder(block.blocks) : [block];
    return shown.some((each) => readsHiddenField(template, each)) ? 'hidden' : lists.map((key) => playerAccess(template, key)).reduce(stricter);
  }
  if (isContainerBlock(block) || block.type === 'heading' || block.type === 'divider') return 'read';
  if (block.type === 'metric') {
    const fallbackHidden = readsHiddenField(template, { ...block, fields: [] });
    return fallbackHidden ? 'hidden' : block.fields.filter((key) => key !== '').map((key) => playerAccess(template, key)).reduce(laxer, 'hidden');
  }
  if (readsHiddenField(template, block)) return 'hidden';
  switch (block.type) {
    case 'title': case 'line': case 'stat': {
      const keys = block.type === 'line' ? block.fields : [block.field];
      const access = keys.map((key) => playerAccess(template, key)).reduce(stricter, 'edit');
      return showsOwnValue(block) ? access : stricter(access, 'read');
    }
    case 'track': return block.resource === undefined ? playerAccess(template, block.field) : stricter(playerAccess(template, block.field), 'read');
    case 'text': return block.field === undefined ? 'read' : playerAccess(template, block.field);
    default: return playerAccess(template, block.field);
  }
}
