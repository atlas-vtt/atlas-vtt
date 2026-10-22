import { MAX_CARD_COLUMNS, MAX_CARD_WIDTH, MAX_COLUMN_WIDTH, MIN_CARD_WIDTH, MIN_COLUMN_WIDTH, type AbilityComponent, type BookStatblock, type SheetCard, type SheetSigils, type SheetValue } from '../../protocol/index.ts';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import { FALLBACK_PANEL_WIDTH, paneCardWidth } from '../../../statblocks/editor/note-panel/paneCardWidth';
import { evaluateCondition } from '../../../statblocks/expressions/conditions';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { StatblockTemplate } from '../../../statblocks/model/templateTypes';
import { sheetState } from '../../../statblocks/render/sheetState';
import { readerFor } from '../../../statblocks/values/fieldValues';
import { shownRecord } from './playerAccess.ts';
import { placedSheetValues } from './placedResources.ts';
import { sheetReferences } from './sheetReferences.ts';
import { trackedSheetValues } from './trackedSheet.ts';
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
  /** The width of the GM's statblock panel, which the card is laid out at (`paneCardWidth`); unset, a default. */
  readonly panelWidth?: number;
}

/** The template's column width where it sets none (`StatblockSheet`). */
const DEFAULT_COLUMN_WIDTH_EM = 22;

/** A number within its range; `fallback` where it is none (a template or setting a newer Atlas wrote), so a card is never refused whole. */
const clamp = (value: number, min: number, max: number, fallback = min): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/** The GM's card as the note panel lays it out: its width, the template's columns, and whether the header's description leads the sheet. */
function sheetCard(template: StatblockTemplate, panelWidth: number | undefined, description: boolean): SheetCard {
  const maxColumns = Math.round(clamp(template.layout.maxColumns, 1, MAX_CARD_COLUMNS, 1));
  return {
    width: clamp(paneCardWidth(Number.isFinite(panelWidth) ? panelWidth ?? FALLBACK_PANEL_WIDTH : FALLBACK_PANEL_WIDTH, maxColumns), MIN_CARD_WIDTH, MAX_CARD_WIDTH, paneCardWidth(FALLBACK_PANEL_WIDTH, maxColumns)),
    columnWidth: clamp(template.layout.columnWidth ?? DEFAULT_COLUMN_WIDTH_EM, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH_EM),
    maxColumns,
    description,
  };
}

/** A drawn statblock, and the whole texts it names by hash, for the player it is drawn for to fetch. */
export interface DrawnStatblock {
  readonly statblock: BookStatblock | null;
  readonly texts: readonly SheetTextAsset[];
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
  // The numbers the template tracks are resources of the character too, held or where they start
  const tracked = trackedSheetValues(input.resolved, input.definitions, input.resources);
  const placed = placedSheetValues(input.resolved, input.definitions, input.resources);
  const build: SheetBuild = {
    template, record, editable, texts,
    shown: sheetState({ template, record: shown, mode: 'view', resources: input.definitions }),
    editing: sheetState({ template, record: shown, mode: 'editing', resources: input.definitions }),
    definitions: [...input.definitions, ...tracked.map((each) => each.definition)],
    // Gauges the template places for resources the token holds no value of start where the statblock starts them
    resources: { ...input.resources, ...Object.fromEntries([...tracked, ...placed].map((each) => [each.definition.key, each.value])) },
    budget: new SheetBudget(),
    holds: (block) => block.showWhen === undefined || evaluateCondition(block.showWhen, reader),
  };
  const head = sheetHead(build);
  const walk: SheetWalk = { abilities: [] };
  const nodes = sheetNodes(build, template.layout.blocks, 0, { section: null, row: false }, walk);
  const sigils: { -readonly [K in keyof SheetSigils]: SheetValue } = {};
  for (const [id, sigil] of head.sigils) if (build.budget.takeValue(sigil)) sigils[id] = sigil;
  build.budget.reserveForAbilities(walk.abilities.length > 0);
  const blocks = fittedNodes(build.budget, head.description ? [head.description, ...nodes] : nodes);
  const abilities = fittedAbilities(build.budget, walk.abilities);
  const hitPoints = head.hitPoints !== null && build.budget.takeNode(head.hitPoints) ? head.hitPoints : null;
  // What the player's references read, for what they write before this statblock is drawn again
  const references = editable ? sheetReferences(template, shown, fields) : undefined;
  if (build.budget.droppedNodes > 0) console.warn(`[Atlas] The statblock ${input.resolved.path} is larger than a player's page takes: its last ${build.budget.droppedNodes} blocks are left out.`);
  return {
    editable,
    displayName: head.displayName,
    sigils,
    blocks,
    abilities,
    card: sheetCard(template, input.panelWidth, head.description !== null && blocks[0] === head.description),
    ...(hitPoints !== null && { hitPoints }),
    ...(references !== undefined && { references }),
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
