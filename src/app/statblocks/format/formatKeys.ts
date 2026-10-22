/**
 * The keys of every kind of object in a template file, in the order the file
 * writes them. A key not listed for its kind is unknown: the parser keeps it
 * and the serializer writes it after the known ones. Each list is written as a
 * record over the type's keys, so a key added to `templateTypes.ts` and not
 * here fails to compile.
 */

import type {
  BlockBase,
  BlockType,
  Condition,
  CounterPreset,
  EntryShape,
  FieldTracking,
  HeaderTrack,
  ScoreColumn,
  StatblockTemplate,
  TemplateBlock,
  TemplateField,
  TemplateHeader,
  TemplateLayout,
  TemplateSource,
} from '../model/templateTypes';

/** Block types a file may hold; `opaque` exists only in memory. */
export type FileBlockType = Exclude<BlockType, 'opaque'>;

export interface KeyOrder<K extends string = string> {
  readonly keys: readonly K[];
  has(key: string): boolean;
}

type KeysOfUnion<T> = T extends unknown ? keyof T & string : never;
type BlockOf<T extends BlockType> = Extract<TemplateBlock, { type: T }>;
type OwnBlockKeys<T extends BlockType> = Exclude<KeysOfUnion<BlockOf<T>>, keyof BlockBase | 'type'>;
type DerivedFrom = NonNullable<StatblockTemplate['derivedFrom']>;
type ImportedFrom = NonNullable<StatblockTemplate['importedFrom']>;
type EntryExtra = NonNullable<EntryShape['extras']>[number];

function orderOf<K extends string>(keys: readonly K[]): KeyOrder<K> {
  const known = new Set<string>(keys);
  return { keys, has: (key: string): boolean => known.has(key) };
}

function keyOrder<K extends string>(order: Record<K, true>): KeyOrder<K> {
  return orderOf(Object.keys(order).filter((key): key is K => Object.hasOwn(order, key)));
}

export const TEMPLATE_KEYS = keyOrder<keyof StatblockTemplate>({
  format: true, version: true, id: true, description: true, suits: true, diceSetId: true, derivedFrom: true, source: true,
  importedFrom: true, fields: true, header: true, layout: true, players: true, lookups: true, sample: true, recovery: true,
});

export const HEADER_KEYS = keyOrder<keyof TemplateHeader>({ hidden: true, hitPoints: true });

export const HEADER_TRACK_KEYS = keyOrder<keyof HeaderTrack>({ look: true, counts: true, resource: true });

export const FIELD_KEYS = keyOrder<keyof TemplateField>({
  key: true, label: true, type: true, meaning: true, formerKeys: true, unit: true, options: true, open: true,
  several: true, numbered: true,
  slots: true, slotKeys: true, header: true, rows: true, align: true, addRows: true, addColumns: true, entry: true,
  counterRows: true, prompt: true, tracks: true,
});

export const FIELD_TRACKING_KEYS = keyOrder<keyof FieldTracking>({ counts: true, max: true });

export const COUNTER_PRESET_KEYS = keyOrder<keyof CounterPreset>({ name: true, max: true, regain: true });

export const ENTRY_SHAPE_KEYS = keyOrder<keyof EntryShape>({ nameKey: true, textKey: true, extras: true });
export const ENTRY_EXTRA_KEYS = keyOrder<keyof EntryExtra>({ key: true, label: true, type: true, options: true, several: true });
export const LAYOUT_KEYS = keyOrder<keyof TemplateLayout>({ maxColumns: true, columnWidth: true, blocks: true });
export const CONDITION_KEYS = keyOrder<KeysOfUnion<Condition>>({ field: true, is: true, value: true });
export const SCORE_COLUMN_KEYS = keyOrder<keyof ScoreColumn>({ label: true, field: true, formula: true, display: true });
export const DERIVED_FROM_KEYS = keyOrder<keyof DerivedFrom>({ templateId: true, revision: true });
export const IMPORTED_FROM_KEYS = keyOrder<keyof ImportedFrom>({ layoutId: true, layoutName: true, extras: true });
export const SOURCE_KEYS = keyOrder<keyof TemplateSource>({
  system: true, label: true, licences: true, attribution: true, licenceUrl: true, sourceUrl: true,
  modification: true, trademarkNotice: true,
});

const BLOCK_BASE: Record<Exclude<keyof BlockBase, 'id'>, true> = {
  showWhen: true, whenEmpty: true, fallback: true, className: true, size: true, fsExtras: true,
};

const BLOCK_PROPS: { [T in FileBlockType]: Record<OwnBlockKeys<T>, true> } = {
  section: { heading: true, headingField: true, collapsible: true, blocks: true },
  row: { align: true, blocks: true },
  tabs: { heading: true, blocks: true },
  title: { field: true, level: true, pattern: true },
  line: { fields: true, pattern: true, separator: true },
  stat: { field: true, label: true, look: true, pattern: true, display: true, rollFrom: true, rollable: true, addsToRolls: true },
  metric: { heading: true, fields: true, rollable: true, addsToRolls: true },
  scores: { field: true, orientation: true, perLine: true, display: true, columns: true, rollable: true },
  tags: { field: true, label: true, look: true },
  text: { field: true, text: true, heading: true },
  entries: { field: true, heading: true, introField: true, nameStyle: true, addLabel: true },
  pairs: { field: true, label: true, display: true, rollable: true, addsToRolls: true },
  track: { field: true, label: true, resource: true, look: true, counts: true },
  counters: { field: true, label: true },
  image: { field: true, shape: true },
  spells: { field: true, heading: true, look: true },
  heading: { text: true, level: true },
  divider: {},
  script: { summary: true, fs: true },
};

/** Every key any block may hold, for typing readers. */
export type BlockKey = Exclude<KeysOfUnion<TemplateBlock>, 'raw'>;

const FILE_BLOCK_TYPES: ReadonlySet<string> = new Set(Object.keys(BLOCK_PROPS));
const ALL_BLOCK_KEYS: ReadonlySet<string> = new Set([
  'id', 'type', ...Object.keys(BLOCK_BASE), ...Object.values(BLOCK_PROPS).flatMap((props) => Object.keys(props)),
]);

export function isFileBlockType(value: unknown): value is FileBlockType {
  return typeof value === 'string' && FILE_BLOCK_TYPES.has(value);
}

function isBlockKey(key: string): key is BlockKey {
  return ALL_BLOCK_KEYS.has(key);
}

/** A block's keys: id and type, its own properties, the shared ones, then its children last. */
function blockKeyOrder(type: FileBlockType): KeyOrder<BlockKey> {
  const own = Object.keys(BLOCK_PROPS[type]).filter((key) => key !== 'blocks');
  const children = Object.hasOwn(BLOCK_PROPS[type], 'blocks') ? ['blocks'] : [];
  return orderOf(['id', 'type', ...own, ...Object.keys(BLOCK_BASE), ...children].filter(isBlockKey));
}

const BLOCK_KEY_ORDERS: ReadonlyMap<string, KeyOrder<BlockKey>> = new Map(
  [...FILE_BLOCK_TYPES].filter(isFileBlockType).map((type): [string, KeyOrder<BlockKey>] => [type, blockKeyOrder(type)]),
);

const BASE_ONLY = blockKeyOrder('divider');

/** The keys of a block of `type`; an unknown type gets the shared ones only. */
export function blockKeys(type: string): KeyOrder<BlockKey> {
  return BLOCK_KEY_ORDERS.get(type) ?? BASE_ONLY;
}
