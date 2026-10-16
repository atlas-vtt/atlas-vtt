/**
 * The statblock template format: a field schema plus a tree of blocks.
 * Pure data, no Obsidian and no React (a lint rule keeps it that way).
 */

export const TEMPLATE_FORMAT = 'atlas-statblock-template';
export const TEMPLATE_VERSION = 1;
export const BUILT_IN_TEMPLATE_PREFIX = 'builtin:';

/** `builtin:<slug>` for built-ins, `<slug>-<6 base36>` for vault templates. Never changes. */
export type TemplateId = string;
/** A top-level frontmatter key of a statblock note. */
export type FieldKey = string;
export type FieldValue = string | number | boolean | null | FieldValue[] | { [key: string]: FieldValue };

export interface StatblockTemplate {
  format: typeof TEMPLATE_FORMAT;
  version: number;
  id: TemplateId;
  /** The name is the file's basename (built-ins: `BuiltInTemplate.name`); it is never stored in the file. */
  description?: string;
  /** Role names it suits; a hint for pickers, never a restriction. */
  suits?: string[];
  /**
   * The dice set from the vault's library its statblocks roll a bare bonus with ("+6").
   * Unset, or a set the library lacks: the collection's dice (`statblockDiceSet`).
   */
  diceSetId?: string;
  /** What a statblock of this template holds, in form order (Tab order in the statblock pane). */
  fields: TemplateField[];
  /** The header's parts this template keeps off the card (`templateHeader.ts`). Absent: every part shows. */
  header?: TemplateHeader;
  /** What the template lays out below the header. */
  layout: TemplateLayout;
  /**
   * What a player may do with a field of their own character's statblock, by the field's key, where it is not
   * what a field of its kind lets them do by default. Holds only those exceptions. A setting that is no
   * `PlayerAccess` (one of a newer Atlas) is kept as written and counts as `hidden`.
   */
  players?: Record<FieldKey, PlayerAccess | (string & NonNullable<unknown>)>;
  /** Tables patterns read with `{cr|lookup:xp}`. */
  lookups?: Record<string, Record<string, string>>;
  /** Values the template editor previews with when no statblock is picked. Never creature content in built-ins. */
  sample?: Record<FieldKey, FieldValue>;
  /** The template it was copied from, with the built-in's revision at the time. */
  derivedFrom?: { templateId: TemplateId; revision?: number };
  /** Licence and attribution of a licensed built-in; copied with the template and kept on copies. */
  source?: TemplateSource;
  /** The FS layout it was imported from, and layout-level keys Atlas does not model. Code-bearing keys among the extras are code. */
  importedFrom?: { layoutId: string; layoutName: string; extras?: Record<string, unknown> };
}

export type FieldType =
  | 'text'      // one line, inline Markdown
  | 'markdown'  // paragraphs
  | 'number'
  | 'rating'    // "1/4", "½", "3+1*", whole numbers stored as numbers
  | 'dice'      // "7d10 + 14": validated, rollable, average shown
  | 'choice'    // one of `options` (or any, if `open`)
  | 'list'      // string list
  | 'scores'    // a Table: rows of cells under named columns (one row: a flat list)
  | 'entries'   // list of { name, desc, ...extras }
  | 'pairs'     // { dex: 5 } or [{ dex: 5 }]
  | 'image'     // vault path
  | 'spells';   // FS spell shape: strings or { level: spells }

export const FIELD_TYPES: readonly FieldType[] = [
  'text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'entries', 'pairs', 'image', 'spells',
];

/**
 * What Atlas uses a field for when its key is not the conventional one. `display-name`: the name the header shows
 * where the statblock has one ("Aranea"), while `name` stays the statblock's identity ("Aranea (Cairn)").
 */
export type FieldMeaning =
  | 'hit-points' | 'armor' | 'rating' | 'size' | 'creature-type' | 'senses' | 'initiative' | 'traits' | 'description'
  | 'display-name';

export const FIELD_MEANINGS: readonly FieldMeaning[] = [
  'hit-points', 'armor', 'rating', 'size', 'creature-type', 'senses', 'initiative', 'traits', 'description', 'display-name',
];

/**
 * The parts of the header every statblock has, in the order Atlas draws them
 * (`templateHeader.ts`): the name, the token art, the level, the type, the
 * hit points and the description.
 */
export type HeaderPartId = 'name' | 'token' | 'level' | 'type' | 'hp' | 'description';

export const HEADER_PART_IDS: readonly HeaderPartId[] = ['name', 'token', 'level', 'type', 'hp', 'description'];

/** What a template says about its header; a part's name on the card is its field's label. */
export interface TemplateHeader {
  /** Parts kept off the card, in `HEADER_PART_IDS` order; never the name or the token art. */
  hidden?: HeaderPartId[];
  /** The hit points drawn as a track (a row of boxes, a gauge) where the system marks them so; unset, as a number. */
  hitPoints?: HeaderTrack;
}

/** How the header draws a track: a Track block's look without its field, which is the part's own. */
export interface HeaderTrack {
  look: 'boxes' | 'gauge';
  counts: 'down' | 'up';
  /** The token resource whose values the track shows on a token's statblock. */
  resource?: string;
}

/** What a player may do with a field of their own character's statblock: change it, only read it, or not see it. */
export type PlayerAccess = 'edit' | 'read' | 'hidden';

export const PLAYER_ACCESS: readonly PlayerAccess[] = ['edit', 'read', 'hidden'];

export function isPlayerAccess(value: unknown): value is PlayerAccess {
  return PLAYER_ACCESS.some((access) => access === value);
}

export interface TemplateField {
  key: FieldKey;
  label: string;
  type: FieldType;
  meaning?: FieldMeaning;
  /** Keys this field had before renames, newest first; read when `key` is absent. */
  formerKeys?: FieldKey[];
  /** number, and choice with `numbered`: written after the number ("ft."). */
  unit?: string;
  /** choice: offered values; `open` accepts others too. */
  options?: string[];
  open?: boolean;
  /** choice: several of the options at once, written as one line in the order of `options` ("Common, Elvish"). */
  several?: boolean;
  /** choice: each pick carries a number, written after it with `unit` ("darkvision 60 ft."). */
  numbered?: boolean;
  /** scores: one name per column (the header row), in stored order. */
  slots?: string[];
  /** scores: each column's key, where a value written by name (`{ strength: 18 }`) or a worked-out row's pairs field reads it. Default: the names in lower case. */
  slotKeys?: string[];
  /** scores: `false` draws no header row; the names still name the columns for screen readers. */
  header?: false;
  /** scores: the rows every statblock starts with, each its cells in column order. Unset: one empty row. */
  rows?: TableCell[][];
  /** scores: each column's alignment, in column order; unset or null is `start`. */
  align?: (TableAlign | null)[];
  /** scores: `false` keeps every statblock to the rows it starts with. Unset: statblocks add, remove, move and sort rows. */
  addRows?: false;
  /** scores: `false` keeps the template's columns. Unset: statblocks add, remove, move and rename columns. */
  addColumns?: false;
  /** entries: the keys inside an entry. */
  entry?: EntryShape;
  /** Prompt for an empty value in the statblock pane ("Add speed"). */
  prompt?: string;
}

/** One cell of a Table: a number, text, or nothing. */
export type TableCell = string | number | null;

/** Where a Table column's cells stand, as Obsidian aligns a Markdown table's columns. */
export type TableAlign = 'start' | 'center' | 'end';

export const TABLE_ALIGNS: readonly TableAlign[] = ['start', 'center', 'end'];

export interface EntryShape {
  /** Default 'name'. */
  nameKey?: string;
  /** Default 'desc' (FS); FS's Daggerheart notes use 'text'. */
  textKey?: string;
  /** Short labelled parts shown before the text ("Range", "Cost"). */
  extras?: EntryExtraShape[];
}

/**
 * One part every entry of a list has besides its name and text. A `choice`
 * part is one of the template's `options` ("Main action", "Reaction",
 * "Passive"), picked per entry; with `several`, any of them at once, written
 * as one line in the order of `options`.
 */
export interface EntryExtraShape {
  key: string;
  label: string;
  type: EntryExtraType;
  options?: string[];
  several?: boolean;
}

export type EntryExtraType = 'text' | 'number' | 'list' | 'dice' | 'choice';

export interface TemplateLayout {
  /** Most columns at full width. Default 2. */
  maxColumns: 1 | 2 | 3;
  /** Least column width in em. Default 22. */
  columnWidth?: number;
  blocks: TemplateBlock[];
}

export type Condition =
  | { field: FieldKey; is: 'present' | 'absent' }
  | { field: FieldKey; is: 'equal' | 'not-equal'; value: string | number | boolean }
  | { field: FieldKey; is: 'above' | 'below'; value: number };

export interface BlockBase {
  /** 8 base36, unique in the template; selection, undo, chrome and FS block ids follow it. */
  id: string;
  showWhen?: Condition;
  /**
   * While every field it shows is empty. Unset or 'hide': hidden. 'fallback': its `fallback` shows. 'fold': hidden
   * where a statblock is read, and folded into a chip under the card where it is filled in (FS's `conditioned`).
   */
  whenEmpty?: 'hide' | 'fallback' | 'fold';
  /** A pattern, so it may derive a value from other fields; never stored in the note. */
  fallback?: string;
  /** Exposed as `data-cls` for themes; FS `cls`. */
  className?: string;
  /** Inside a Row: 'fit' sizes to content, 'fill' shares the free width. Default per block type. */
  size?: 'fit' | 'fill';
  /** Keys of an imported FS block that Atlas does not model; written back on export. Code-bearing keys among them are code. */
  fsExtras?: Record<string, unknown>;
}

export interface SectionBlock extends BlockBase { type: 'section'; heading?: string; headingField?: FieldKey; collapsible?: 'open' | 'closed'; blocks: TemplateBlock[] }
export interface RowBlock extends BlockBase { type: 'row'; align?: 'start' | 'center' | 'spread'; blocks: TemplateBlock[] }
/** Sections shown one at a time; each Section's heading is its tab's label, `heading` stands above the strip. Holds Sections only. */
export interface TabsBlock extends BlockBase { type: 'tabs'; heading?: string; blocks: TemplateBlock[] }
export interface TitleBlock extends BlockBase { type: 'title'; field: FieldKey; level: 1 | 2 | 3; pattern?: string }
export interface LineBlock extends BlockBase { type: 'line'; fields: FieldKey[]; pattern?: string; separator?: string }
/**
 * `rollable` ("Roll as a bonus"), on a Value, Metric, Table or Labels and values: every whole number it shows is a
 * roll link, rolled as a bonus (`2` rolls `+2`) with the game's own dice, as a signed bonus in its text already is.
 */
export interface Rollable { rollable?: true }
export interface StatBlock extends BlockBase, Rollable { type: 'stat'; field: FieldKey; label?: string; look: 'run-in' | 'stacked'; pattern?: string; display?: 'plain' | 'signed'; rollFrom?: FieldKey }
/**
 * A stat block's key numbers in one box: each a field of its own, its label the number's name over a large
 * value, a rule between two ("Major 8 | Severe 15"). `heading` names the group above them where it holds two or
 * more. A number not named yet is `''` until its label is committed, as a new Value's field is.
 */
export interface MetricBlock extends BlockBase, Rollable { type: 'metric'; heading?: string; fields: FieldKey[] }
/**
 * A worked-out row of a Table (`columns` in the file): per column, the column's entry in a pairs field (by its
 * key), else the formula over the column's value in the table's one row (`value`), as a modifier under an ability
 * score. Drawn only while the table holds one row, where each column has one value.
 */
export interface ScoreColumn { label?: string; field?: FieldKey; formula?: string; display?: 'plain' | 'signed' }
/** A Table: the rows and columns its property holds (`TemplateField.rows`, `slots`), drawn as Obsidian draws a Markdown table. */
export interface ScoresBlock extends BlockBase, Rollable {
  type: 'scores';
  field: FieldKey;
  /** 'row': a grid, the header row over the rows. 'table': a table of one row, one line per column (the 5E 2024 look). */
  orientation: 'row' | 'table';
  /** table: lines side by side; fewer where the width does not hold them. */
  perLine?: number;
  /** How the numbers in the cells show: 3 or +3. */
  display?: 'plain' | 'signed';
  /** Its worked-out rows. */
  columns?: ScoreColumn[];
}
/** A list of words: run in after its label with commas, as chips, or one per line with bullets or numbers. */
export interface TagsBlock extends BlockBase { type: 'tags'; field: FieldKey; label?: string; look: 'comma' | 'chips' | 'bullets' | 'numbered' }
export interface TextBlock extends BlockBase { type: 'text'; field?: FieldKey; text?: string; heading?: string }
export interface EntriesBlock extends BlockBase { type: 'entries'; field: FieldKey; heading?: string; introField?: FieldKey; nameStyle?: 'run-in' | 'heading'; addLabel?: string }
export interface PairsBlock extends BlockBase, Rollable { type: 'pairs'; field: FieldKey; label?: string; display?: 'plain' | 'signed' }
export interface TrackBlock extends BlockBase { type: 'track'; field: FieldKey; label?: string; resource?: string; look: 'boxes' | 'gauge'; counts: 'down' | 'up' }
export interface ImageBlock extends BlockBase { type: 'image'; field: FieldKey; shape: 'token' | 'portrait' }
/** `look: 'tabs'` shows each group as a tab, loose lines above the strip; unset is 'lines'. */
export interface SpellsBlock extends BlockBase { type: 'spells'; field: FieldKey; heading?: string; look?: 'lines' | 'tabs' }
export interface HeadingBlock extends BlockBase { type: 'heading'; text: string; level: 'section' | 'minor' }
export interface DividerBlock extends BlockBase { type: 'divider' }
/** FS JavaScript preserved verbatim from an import. Never authored, never run by the native renderer, never bundled. */
export interface ScriptBlock extends BlockBase { type: 'script'; summary: string; fs: Record<string, unknown> }
/** A block of a type this Atlas does not know (a newer template). Renders nothing and is written back as it was read. */
export interface OpaqueBlock extends BlockBase { type: 'opaque'; raw: Record<string, unknown> }

export type TemplateBlock =
  | SectionBlock | RowBlock | TabsBlock | TitleBlock | LineBlock | StatBlock | MetricBlock | ScoresBlock | TagsBlock | TextBlock
  | EntriesBlock | PairsBlock | TrackBlock | ImageBlock | SpellsBlock | HeadingBlock | DividerBlock | ScriptBlock | OpaqueBlock;

export type BlockType = TemplateBlock['type'];
export type ContainerBlock = SectionBlock | RowBlock | TabsBlock;
export type ContainerType = ContainerBlock['type'];

export function isContainerType(type: BlockType): type is ContainerType {
  return type === 'section' || type === 'row' || type === 'tabs';
}

export function isContainerBlock(block: TemplateBlock): block is ContainerBlock {
  return isContainerType(block.type);
}

/** A list of words whose items stand on their own (chips, bullets, numbers): it shows a label only where the template gives one. */
export function wordsStandAlone(block: TemplateBlock): boolean {
  return block.type === 'tags' && block.look !== 'comma';
}

export type TemplateLicence =
  | 'CC-BY-4.0' | 'CC-BY-3.0' | 'CC-BY-SA-4.0' | 'ORC' | 'DS-Creator' | 'RTG-Homebrew' | 'Paizo-CUP';

export interface TemplateSource {
  /** "5E (2024 rules)". */
  system: string;
  /** The one quiet line on cards: "SRD 5.2.1 · CC BY 4.0". */
  label: string;
  licences: TemplateLicence[];
  /** Verbatim; a unit test checks it appears in THIRD_PARTY_NOTICES.md. */
  attribution: string;
  licenceUrl: string;
  sourceUrl?: string;
  /** "Atlas VTT arranged the stat block structure as an editable template." */
  modification: string;
  /** A non-affiliation or trademark line, only where the licence or policy asks for one. */
  trademarkNotice?: string;
}

export type BuiltInTemplateId = `${typeof BUILT_IN_TEMPLATE_PREFIX}${string}`;

export interface BuiltInTemplate {
  id: BuiltInTemplateId;
  name: string;
  /** Raised with every change of layout or labels; never with a removed key (append-only, snapshot-tested). */
  revision: number;
  template: StatblockTemplate;
}

export function isBuiltInTemplateId(id: TemplateId): id is BuiltInTemplateId {
  return id.startsWith(BUILT_IN_TEMPLATE_PREFIX);
}
