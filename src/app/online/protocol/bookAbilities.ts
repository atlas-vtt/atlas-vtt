import { bookLine, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { isFieldKey, isSheetKey, MAX_SHEET_OPTIONS, optionalSheetLine, parseLines, parseSheetRaw, parseSheetText, spendText, type SheetBudget, type SheetRaw, type SheetText } from './sheetValues.ts';

export const MAX_ABILITY_COMPONENTS = 24;
export const MAX_ABILITY_TABS = 24;
/** The most abilities of one statblock, over all its lists. */
export const MAX_ABILITIES = 400;
export const MAX_ABILITY_PARTS = 12;
/** An Abilities component's id: its block's id in the template. */
const BLOCK_ID = /^[0-9a-z]{1,16}$/;

/** One part every ability of a list has besides its name and text, as the template shapes it. A `choice` part is picked from its options. */
export interface AbilityPart {
  readonly key: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'list' | 'dice' | 'choice';
  readonly options?: readonly string[];
  readonly several?: boolean;
}

/** An ability as the note holds it: `key` names it among the list's items (content hash and occurrence). */
export interface AbilityEntry {
  readonly key: string;
  readonly name: string;
  readonly text: SheetText;
  readonly parts: Readonly<Record<string, SheetRaw>>;
}

/**
 * One list of a component: a tab of it (with its label) or the component's one list (label null). `list` is the field the
 * note keeps it in; `intro` the text the card shows above its abilities ("The dragon can take 3 legendary actions"), read only.
 */
export interface AbilityTab {
  readonly label: string | null;
  readonly list: string;
  readonly intro?: SheetText;
  readonly entries: readonly AbilityEntry[];
}

/**
 * An Abilities component of the template under its GM-given name, with the parts its abilities
 * have. `edit`: the list is the player's to add to, change and remove from; `read`: shown only.
 * `spells`: a spell list in Fantasy Statblocks' shape, names only, grouped by level, never editable.
 */
export interface AbilityComponent {
  readonly id: string;
  readonly name: string;
  readonly access: 'edit' | 'read';
  readonly parts: readonly AbilityPart[];
  readonly tabs: readonly AbilityTab[];
  readonly spells?: true;
  /** The keys an ability of the note keeps its name and text under; unset, `name` and `desc`. An ability written from the page is `{ [nameKey]: name, [textKey]: text, ...parts }`, without empty values. */
  readonly nameKey?: string;
  readonly textKey?: string;
}

function parsePart(value: unknown): AbilityPart | null {
  if (!isRecord(value) || !isFieldKey(value.key)) return null;
  const label = bookLine(value.label, MAX_BOOK_TITLE);
  const types: readonly unknown[] = ['text', 'number', 'list', 'dice', 'choice'];
  const options = value.options === undefined ? undefined : parseLines(value.options, MAX_SHEET_OPTIONS);
  if (label === null || !types.includes(value.type) || options === null || (value.several !== undefined && typeof value.several !== 'boolean')) return null;
  return { key: value.key, label, type: value.type as AbilityPart['type'], ...(options !== undefined && { options }), ...(value.several === true && { several: true }) };
}

function parseEntry(value: unknown, budget: SheetBudget): AbilityEntry | null {
  if (!isRecord(value) || !isSheetKey(value.key) || !isRecord(value.parts)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE, true);
  const text = parseSheetText(value.text);
  const parts = parseSheetRaw(value.parts);
  budget.abilities += 1;
  if (name === null || text === null || parts === undefined || budget.abilities > MAX_ABILITIES) return null;
  if (!spendText(budget, text) || !spendText(budget, name + JSON.stringify(parts))) return null;
  return { key: value.key, name, text, parts: parts as Record<string, SheetRaw> };
}

function parseTab(value: unknown, budget: SheetBudget): AbilityTab | null {
  if (!isRecord(value) || !isFieldKey(value.list) || !Array.isArray(value.entries)) return null;
  const label = optionalSheetLine(value.label);
  const intro = value.intro === undefined ? undefined : parseSheetText(value.intro);
  if (intro === null || (intro !== undefined && !spendText(budget, intro))) return null;
  const entries = value.entries.map((entry) => parseEntry(entry, budget));
  if (label === undefined || entries.some((entry) => entry === null)) return null;
  return { label, list: value.list, ...(intro !== undefined && { intro }), entries: entries as AbilityEntry[] };
}

export function parseComponent(value: unknown, budget: SheetBudget): AbilityComponent | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !BLOCK_ID.test(value.id) || (value.access !== 'edit' && value.access !== 'read')) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const parts = Array.isArray(value.parts) && value.parts.length <= MAX_ABILITY_PARTS ? value.parts.map(parsePart) : null;
  const tabs = Array.isArray(value.tabs) && value.tabs.length > 0 && value.tabs.length <= MAX_ABILITY_TABS ? value.tabs.map((tab) => parseTab(tab, budget)) : null;
  if (name === null || parts === null || tabs === null || parts.some((part) => part === null) || tabs.some((tab) => tab === null)) return null;
  const spells = value.spells === true;
  const keyOk = (key: unknown): boolean => key === undefined || isFieldKey(key);
  if (!keyOk(value.nameKey) || !keyOk(value.textKey)) return null;
  return {
    id: value.id, name, access: spells ? 'read' : value.access, parts: parts as AbilityPart[], tabs: tabs as AbilityTab[], ...(spells && { spells: true }),
    ...(isFieldKey(value.nameKey) && { nameKey: value.nameKey }), ...(isFieldKey(value.textKey) && { textKey: value.textKey }),
  };
}

/** Lists of a statblock the player may change, by the field the note keeps them in. */
export function editableLists(abilities: readonly AbilityComponent[], editable: boolean): Set<string> {
  if (!editable) return new Set();
  return new Set(abilities.filter((entry) => entry.access === 'edit').flatMap((entry) => entry.tabs.map((tab) => tab.list)));
}
