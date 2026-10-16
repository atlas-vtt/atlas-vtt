import { MAX_ABILITY_COMPONENTS, MAX_ABILITY_TABS, parseComponent, type AbilityComponent } from './bookAbilities.ts';
import { isResourceKey } from './bookCharacter.ts';
import { MAX_FORMULA } from './dice.ts';
import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import {
  MAX_SHEET_LIST, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, newSheetBudget, optionalSheetLine, parseLines, parseSheetField, parseSheetText, spendText,
  type SheetBudget, type SheetField, type SheetText,
} from './sheetValues.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** What a drawn statblock holds at most. */
export const MAX_SHEET_NODES = 300;
export const MAX_SHEET_DEPTH = 6;

/** A pair of a pairs value as shown: "DEX +2". */
export interface SheetPair {
  readonly label: string;
  readonly value: string;
  /** What a click on it rolls (`SheetValue.roll`). */
  readonly roll?: string;
}

/**
 * A value as the sheet shows it: its label, its text worked out, and how it reads (plain, Markdown,
 * a list of words, labels with values). `field` is what the player may change, `prompt` what an
 * empty one they may fill in asks for. `resource` names the character's resource the value is
 * (hit points): the page shows that resource's values there, editable as a resource.
 */
export interface SheetValue {
  readonly label: string | null;
  readonly look: 'plain' | 'markdown' | 'words' | 'pairs';
  readonly text: SheetText;
  readonly words?: readonly string[];
  readonly pairs?: readonly SheetPair[];
  readonly field: SheetField | null;
  readonly prompt: string | null;
  readonly resource?: string;
  /**
   * What a click on the value rolls, where the template makes it rollable: a bonus (`+2`), which the
   * GM's Atlas completes with the game's own dice, or dice (`1d8+3`). Rolled through the table's `roll`.
   */
  readonly roll?: string;
}

/** The blocks of the sheet beside the character, in the template's order; abilities are never among them. */
export type SheetNode =
  | { readonly k: 'section'; readonly heading: string | null; readonly nodes: readonly SheetNode[] }
  | { readonly k: 'row'; readonly nodes: readonly SheetNode[] }
  | { readonly k: 'tabs'; readonly heading: string | null; readonly tabs: readonly { readonly label: string; readonly nodes: readonly SheetNode[] }[] }
  | { readonly k: 'heading'; readonly text: string; readonly minor: boolean }
  | { readonly k: 'value'; readonly value: SheetValue }
  | { readonly k: 'metric'; readonly heading: string | null; readonly values: readonly SheetValue[] }
  /** `worked`: a table's worked-out rows (a modifier under each score), each labelled by `workedLabels` where the GM names them. */
  | { readonly k: 'table'; readonly label: string | null; readonly columns: readonly string[]; readonly rows: readonly (readonly (string | null)[])[]; readonly worked: readonly (readonly (string | null)[])[]; readonly workedLabels?: readonly string[]; readonly rolls?: readonly (readonly (string | null)[])[]; readonly workedRolls?: readonly (readonly (string | null)[])[]; readonly field: SheetField | null }
  | { readonly k: 'track'; readonly label: string | null; readonly look: 'boxes' | 'gauge'; readonly counts: 'down' | 'up'; readonly current: number; readonly max: number; readonly resource: string | null; readonly field: SheetField | null }
  | { readonly k: 'divider' };

/** The parts of the header the sheet draws as sigils and plates beside the portrait. */
export interface SheetSigils {
  readonly hp?: SheetValue;
  readonly armor?: SheetValue;
  readonly level?: SheetValue;
  readonly type?: SheetValue;
}

/**
 * The player's own character's statblock as the GM's Atlas draws it for them: only what the
 * template lets players see, every text worked out. `editable` is false where the template cannot
 * be read as it was written (missing, of a newer Atlas): then nothing of it may be changed.
 */
export interface BookStatblock {
  readonly editable: boolean;
  readonly displayName: string | null;
  readonly sigils: SheetSigils;
  readonly blocks: readonly SheetNode[];
  readonly abilities: readonly AbilityComponent[];
}

/** Sent to one player after every `book` and whenever it changes; null: their character has no statblock they get. */
export interface BookStatblockMessage {
  readonly t: 'book-statblock';
  readonly statblock: BookStatblock | null;
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TOKEN_VALUE;
const optionalResource = (value: unknown): string | null | undefined => (value === null || value === undefined ? null : isResourceKey(value) ? value : undefined);
const LOOKS: readonly unknown[] = ['plain', 'markdown', 'words', 'pairs'];

/** A roll a value offers: undefined for none, null when it is malformed. */
function parseRoll(value: unknown): string | null | undefined {
  return value === undefined ? undefined : bookLine(value, MAX_FORMULA);
}

/** The rolls of a table's cells, shaped as its cells (null for a cell that rolls nothing); undefined for none, null when malformed. */
function parseCellRolls(value: unknown, cells: readonly (readonly unknown[])[]): (string | null)[][] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== cells.length) return null;
  const rows: (string | null)[][] = [];
  for (const [index, row] of value.entries()) {
    if (!Array.isArray(row) || row.length !== cells[index]?.length) return null;
    const rolls = row.map((roll) => (roll === null ? null : parseRoll(roll) ?? undefined));
    if (rolls.some((roll) => roll === undefined)) return null;
    rows.push(rolls as (string | null)[]);
  }
  return rows;
}

function parsePair(value: unknown): SheetPair | null {
  if (!isRecord(value)) return null;
  const label = bookLine(value.label, MAX_BOOK_TITLE);
  const text = bookLine(value.value, MAX_BOOK_TITLE);
  const roll = parseRoll(value.roll);
  return label === null || text === null || roll === null ? null : { label, value: text, ...(roll !== undefined && { roll }) };
}

function parseSheetValue(value: unknown, budget: SheetBudget): SheetValue | null {
  if (!isRecord(value) || !LOOKS.includes(value.look)) return null;
  const label = optionalSheetLine(value.label);
  const text = parseSheetText(value.text);
  const words = value.words === undefined ? undefined : parseLines(value.words, MAX_SHEET_LIST);
  const pairs = value.pairs === undefined ? undefined : Array.isArray(value.pairs) && value.pairs.length <= MAX_SHEET_LIST ? value.pairs.map(parsePair) : null;
  const field = parseSheetField(value.field);
  const prompt = optionalSheetLine(value.prompt);
  const resource = value.resource === undefined ? undefined : isResourceKey(value.resource) ? value.resource : null;
  const roll = parseRoll(value.roll);
  if (label === undefined || text === null || words === null || pairs === null || field === undefined || prompt === undefined || resource === null || roll === null) return null;
  if (pairs !== undefined && pairs.some((pair) => pair === null)) return null;
  if (!spendText(budget, text) || !spendText(budget, [label ?? '', ...(words ?? [])].join(''))) return null;
  return {
    label, look: value.look as SheetValue['look'], text, field, prompt,
    ...(words !== undefined && { words }),
    ...(pairs !== undefined && { pairs: pairs as SheetPair[] }),
    ...(resource !== undefined && { resource }),
    ...(roll !== undefined && { roll }),
  };
}

function parseCells(value: unknown, columns: number): (string | null)[][] | null {
  if (!Array.isArray(value) || value.length > MAX_TABLE_ROWS) return null;
  const rows: (string | null)[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length > columns) return null;
    const cells = row.map((cell) => (cell === null ? null : bookLine(cell, MAX_BOOK_TITLE) ?? undefined));
    if (cells.some((cell) => cell === undefined)) return null;
    rows.push(cells as (string | null)[]);
  }
  return rows;
}

/** The labels of a table's worked-out rows ("Mod", "Save"), one per row, a row without one ''; null when they are not that. */
function parseWorkedLabels(value: unknown, worked: readonly unknown[] | null): string[] | null {
  if (worked === null || !Array.isArray(value) || value.length !== worked.length) return null;
  const labels = value.map((line) => bookLine(line, MAX_BOOK_TITLE, true));
  return labels.every((line) => line !== null) ? (labels) : null;
}

function parseNodes(value: unknown, depth: number, budget: SheetBudget): SheetNode[] | null {
  if (!Array.isArray(value) || depth > MAX_SHEET_DEPTH) return null;
  const nodes: SheetNode[] = [];
  for (const entry of value) {
    budget.nodes += 1;
    const node = budget.nodes <= MAX_SHEET_NODES ? parseNode(entry, depth, budget) : null;
    if (node === null) return null;
    nodes.push(node);
  }
  return nodes;
}

function parseNode(value: unknown, depth: number, budget: SheetBudget): SheetNode | null {
  if (!isRecord(value)) return null;
  switch (value.k) {
    case 'section': {
      const heading = optionalSheetLine(value.heading);
      const nodes = parseNodes(value.nodes, depth + 1, budget);
      return heading === undefined || nodes === null ? null : { k: 'section', heading, nodes };
    }
    case 'row': {
      const nodes = parseNodes(value.nodes, depth + 1, budget);
      return nodes === null ? null : { k: 'row', nodes };
    }
    case 'tabs': {
      const heading = optionalSheetLine(value.heading);
      if (heading === undefined || !Array.isArray(value.tabs) || value.tabs.length === 0 || value.tabs.length > MAX_ABILITY_TABS) return null;
      const tabs: { label: string; nodes: SheetNode[] }[] = [];
      for (const tab of value.tabs) {
        const label = isRecord(tab) ? bookLine(tab.label, MAX_BOOK_TITLE) : null;
        const nodes = isRecord(tab) ? parseNodes(tab.nodes, depth + 1, budget) : null;
        if (label === null || nodes === null) return null;
        tabs.push({ label, nodes });
      }
      return { k: 'tabs', heading, tabs };
    }
    case 'heading': {
      const text = bookLine(value.text, MAX_BOOK_TITLE);
      return text === null || typeof value.minor !== 'boolean' || !spendText(budget, text) ? null : { k: 'heading', text, minor: value.minor };
    }
    case 'value': {
      const shown = parseSheetValue(value.value, budget);
      return shown === null ? null : { k: 'value', value: shown };
    }
    case 'metric': {
      const heading = optionalSheetLine(value.heading);
      if (heading === undefined || !Array.isArray(value.values) || value.values.length === 0 || value.values.length > 6) return null;
      const values = value.values.map((entry) => parseSheetValue(entry, budget));
      return values.every((entry) => entry !== null) ? { k: 'metric', heading, values: values } : null;
    }
    case 'table': {
      const label = optionalSheetLine(value.label);
      const columns = parseLines(value.columns, MAX_TABLE_COLUMNS);
      const rows = columns === null ? null : parseCells(value.rows, columns.length);
      const worked = columns === null ? null : parseCells(value.worked, columns.length);
      const field = parseSheetField(value.field);
      const workedLabels = value.workedLabels === undefined ? undefined : parseWorkedLabels(value.workedLabels, worked);
      if (label === undefined || columns === null || rows === null || worked === null || field === undefined || workedLabels === null) return null;
      const rolls = parseCellRolls(value.rolls, rows);
      const workedRolls = parseCellRolls(value.workedRolls, worked);
      if (rolls === null || workedRolls === null) return null;
      if (!spendText(budget, JSON.stringify([columns, rows, worked, rolls ?? [], workedRolls ?? []])) || !spendText(budget, (workedLabels ?? []).join(''))) return null;
      return {
        k: 'table', label, columns, rows, worked, ...(workedLabels !== undefined && { workedLabels }),
        ...(rolls !== undefined && { rolls }), ...(workedRolls !== undefined && { workedRolls }), field,
      };
    }
    case 'track': {
      const label = optionalSheetLine(value.label);
      const resource = optionalResource(value.resource);
      const field = parseSheetField(value.field);
      const looks = (value.look === 'boxes' || value.look === 'gauge') && (value.counts === 'down' || value.counts === 'up');
      if (label === undefined || resource === undefined || field === undefined || !looks || !isCount(value.current) || !isCount(value.max)) return null;
      return { k: 'track', label, look: value.look as 'boxes' | 'gauge', counts: value.counts as 'down' | 'up', current: value.current, max: value.max, resource, field };
    }
    case 'divider':
      return { k: 'divider' };
    default:
      return null;
  }
}

function parseSigils(value: unknown, budget: SheetBudget): SheetSigils | null {
  if (!isRecord(value)) return null;
  const sigils: { -readonly [K in keyof SheetSigils]: SheetValue } = {};
  for (const name of ['hp', 'armor', 'level', 'type'] as const) {
    if (value[name] === undefined) continue;
    const sigil = parseSheetValue(value[name], budget);
    if (sigil === null) return null;
    sigils[name] = sigil;
  }
  return sigils;
}

/** A drawn statblock as the page reads it, null for none, or undefined when it is malformed or larger than a statblock may be. */
export function parseBookStatblock(value: unknown): BookStatblock | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.editable !== 'boolean') return undefined;
  const budget = newSheetBudget();
  const displayName = optionalSheetLine(value.displayName);
  const sigils = parseSigils(value.sigils, budget);
  const blocks = parseNodes(value.blocks, 0, budget);
  const components = Array.isArray(value.abilities) && value.abilities.length <= MAX_ABILITY_COMPONENTS ? value.abilities.map((entry) => parseComponent(entry, budget)) : null;
  if (displayName === undefined || sigils === null || blocks === null || components === null || components.some((entry) => entry === null)) return undefined;
  const abilities = components as AbilityComponent[];
  if (new Set(abilities.map((entry) => entry.id)).size !== abilities.length) return undefined;
  return { editable: value.editable, displayName, sigils, blocks, abilities };
}

