import type { AbilityComponent, BookStatblock, SheetSigils, SheetValue } from '../../protocol/index.ts';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import { evaluateCondition } from '../../../statblocks/expressions/conditions';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateField } from '../../../statblocks/model/templateTypes';
import { sheetState } from '../../../statblocks/render/sheetState';
import { readerFor, type FieldRecord } from '../../../statblocks/values/fieldValues';
import { playerAccess } from './playerAccess.ts';
import { SheetBudget } from './sheetBudget.ts';
import type { SheetBuild } from './sheetFields.ts';
import { fittedNodes, sheetNodes, type SheetWalk } from './sheetNodes.ts';
import { sheetHead } from './sheetSigils.ts';
import { SheetTexts, type SheetTextAsset } from './sheetTexts.ts';

/** What a player's own character's statblock is drawn from. */
export interface StatblockSheetInput {
  /** The character's statblock note as `resolveStatblock` reads it. */
  readonly resolved: ResolvedStatblock;
  /** The resources of the scene's collection, and the values the character's token holds of them. */
  readonly definitions: readonly ResourceDefinition[];
  readonly resources: Readonly<Record<string, ResourceValue>> | undefined;
}

/** A drawn statblock, and the whole texts it names by hash, for the player it is drawn for to fetch. */
export interface DrawnStatblock {
  readonly statblock: BookStatblock | null;
  readonly texts: readonly SheetTextAsset[];
}

/**
 * The note's values a player may see: those of the template's fields (by their key or one they had
 * before a rename) that are not hidden from players. Everything else the note holds (its other
 * keys, tags, aliases, the template it names) is never read for them.
 */
function shownRecord(record: FieldRecord, template: StatblockTemplate, fields: readonly TemplateField[]): FieldRecord {
  const keys = fields.filter((field) => playerAccess(template, field.key) !== 'hidden').flatMap((field) => [field.key, ...(field.formerKeys ?? [])]);
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));
}

/** The template a native statblock is drawn with for its player, and whether they may change it; null for a statblock of Fantasy Statblocks or the auto template. */
function playedTemplate(resolved: ResolvedStatblock): { template: StatblockTemplate; editable: boolean } | null {
  const { source, template, templateStatus } = resolved;
  if (source.kind !== 'atlas' || template === null) return null;
  if (templateStatus === 'ok') return { template, editable: true };
  return templateStatus === 'missing' || templateStatus === 'newer' ? { template, editable: false } : null;
}

/** The components that fit the budget, each with the abilities that fit, every id once. */
function fittedAbilities(budget: SheetBudget, components: readonly AbilityComponent[]): AbilityComponent[] {
  const ids = new Set<string>();
  return components.flatMap((component): AbilityComponent[] => {
    if (ids.has(component.id) || !budget.takeFrame({ ...component, tabs: component.tabs.map((tab) => ({ ...tab, entries: [] })) })) return [];
    ids.add(component.id);
    return [{ ...component, tabs: component.tabs.map((tab) => ({ ...tab, entries: tab.entries.filter((entry) => budget.takeAbility(entry)) })) }];
  });
}

/**
 * A player's own character's statblock as their page draws it (`BookStatblock`): only a native
 * Atlas statblock gets one, read-only where its template is missing or of a newer Atlas. It shows
 * what the Atlas card shows a reader, through the card's own rules, of what the template lets
 * players see (`playerAccess`): the header's parts as sigils, the layout's blocks as the sheet,
 * every Abilities component and spell list in the Abilities tab. A value the player may change
 * carries what they may change it to and the base an edit names; an empty one carries its prompt.
 * Within the protocol's limits: what does not fit is left out, never sent for the page to refuse.
 * Texts longer than an opening carry their whole text by hash where `texts` knows it.
 */
export function statblockSheet(input: StatblockSheetInput, texts: SheetTexts = new SheetTexts()): BookStatblock | null {
  const played = playedTemplate(input.resolved);
  if (!played) return null;
  const { template, editable } = played;
  const { fields } = withHeaderFields(template);
  const record = input.resolved.fields;
  const shown = shownRecord(record, template, fields);
  const reader = readerFor(record, fields);
  const build: SheetBuild = {
    template, record, editable, texts,
    shown: sheetState({ template, record: shown, mode: 'view' }),
    editing: sheetState({ template, record: shown, mode: 'editing' }),
    definitions: input.definitions,
    resources: input.resources ?? {},
    budget: new SheetBudget(),
    holds: (block) => block.showWhen === undefined || evaluateCondition(block.showWhen, reader),
  };
  const head = sheetHead(build);
  const walk: SheetWalk = { abilities: [], drawnElsewhere: new Set(head.armorBlock === null ? [] : [head.armorBlock]) };
  const nodes = sheetNodes(build, template.layout.blocks, 0, { section: null }, walk);
  const sigils: { -readonly [K in keyof SheetSigils]: SheetValue } = {};
  for (const [id, sigil] of head.sigils) if (build.budget.takeValue(sigil)) sigils[id] = sigil;
  return {
    editable,
    displayName: head.displayName,
    sigils,
    blocks: fittedNodes(build.budget, head.description ? [head.description, ...nodes] : nodes),
    abilities: fittedAbilities(build.budget, walk.abilities),
  };
}

/** The statblock drawn with every whole text it names by hash (drawn twice: hashing takes a promise), and those texts to serve. */
export async function drawnStatblock(input: StatblockSheetInput): Promise<DrawnStatblock> {
  const first = new SheetTexts();
  const statblock = statblockSheet(input, first);
  if (statblock === null || first.wanted.size === 0) return { statblock, texts: [] };
  const assets = await first.hashed();
  const drawn = statblockSheet(input, new SheetTexts(new Map([...assets].map(([text, asset]) => [text, asset.ref]))));
  const named = new Set(namedTexts(drawn));
  return { statblock: drawn, texts: [...assets.values()].filter((asset) => named.has(asset.ref.hash)) };
}

/** The hashes of the whole texts a drawn statblock names, wherever they stand in it. */
function namedTexts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(namedTexts);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const whole = record.whole;
  const own = whole !== null && typeof whole === 'object' && typeof (whole as { hash?: unknown }).hash === 'string' ? [(whole as { hash: string }).hash] : [];
  return [...own, ...Object.values(record).flatMap(namedTexts)];
}
