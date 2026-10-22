import type { BlockIdSource } from './templateIds';
import type { BlockType, FieldKey, FieldType, TemplateBlock } from './templateTypes';

/** Blocks an author can insert; `script` and `opaque` only ever come from a file. */
export type AuthorableBlockType = Exclude<BlockType, 'script' | 'opaque'>;

/** The Fantasy Statblocks block type a block exports to and names in `data-type`. */
export type FsBlockType =
  | 'heading' | 'subheading' | 'property' | 'table' | 'traits' | 'saves' | 'text' | 'image' | 'spells'
  | 'group' | 'inline' | 'javascript';

/** lucide-react icon names the catalogue uses. */
export type BlockIcon =
  | 'heading' | 'text' | 'hash' | 'subtitles' | 'list' | 'table' | 'gauge' | 'image' | 'square-stack' | 'columns-3' | 'minus'
  | 'code' | 'circle-help' | 'panel-top' | 'square-split-horizontal' | 'list-checks';

/** The group of the Add panel a primitive is listed under. */
export type PaletteGroup = 'basics' | 'lists' | 'layout' | 'media';

export const PALETTE_GROUPS: ReadonlyArray<{ id: PaletteGroup; label: string }> = [
  { id: 'basics', label: 'Text and values' },
  { id: 'lists', label: 'Lists and tables' },
  { id: 'layout', label: 'Layout' },
  { id: 'media', label: 'Pictures' },
];

/**
 * What the editor offers and names a block as: the primitive it is, whatever
 * type it has in the file. A primitive of several kinds (a List's items are
 * words, labels with values, names with text or groups) is one block for
 * people; its kind is a setting, which turns the block into the other type.
 */
export type PrimitiveId =
  | 'heading' | 'text' | 'value' | 'metric' | 'line' | 'list' | 'table' | 'track' | 'counters' | 'picture' | 'section' | 'side-by-side' | 'tabs' | 'divider';

type Kinds = readonly [AuthorableBlockType, ...AuthorableBlockType[]];

export interface PrimitiveSpec {
  id: PrimitiveId;
  /** Sentence case, in plain words, as the Add panel, the toolbar, Structure and Settings show it. */
  label: string;
  icon: BlockIcon;
  group: PaletteGroup;
  /** The block type a new one gets. */
  inserts: AuthorableBlockType;
  /** Its block types in the order the kind setting offers them; one where it has no kinds. */
  kinds: Kinds;
  /** The name of the setting that picks among its kinds. */
  kindSetting?: string;
}

function primitive(
  id: PrimitiveId, label: string, icon: BlockIcon, group: PaletteGroup, kinds: Kinds, inserts: AuthorableBlockType = kinds[0], kindSetting?: string,
): PrimitiveSpec {
  return { id, label, icon, group, inserts, kinds, ...(kindSetting && { kindSetting }) };
}

/** Every primitive, in the order the Add panel and Turn into list them. */
export const PRIMITIVES: Readonly<Record<PrimitiveId, PrimitiveSpec>> = {
  heading: primitive('heading', 'Heading', 'heading', 'basics', ['heading', 'title'], 'heading', 'Text'),
  text: primitive('text', 'Text', 'text', 'basics', ['text']),
  value: primitive('value', 'Value', 'hash', 'basics', ['stat']),
  metric: primitive('metric', 'Metric', 'square-split-horizontal', 'basics', ['metric']),
  line: primitive('line', 'Line', 'subtitles', 'basics', ['line']),
  list: primitive('list', 'List', 'list', 'lists', ['tags', 'pairs', 'entries', 'spells'], 'entries', 'Each item is'),
  table: primitive('table', 'Table', 'table', 'lists', ['scores']),
  track: primitive('track', 'Track', 'gauge', 'lists', ['track']),
  counters: primitive('counters', 'Counters', 'list-checks', 'lists', ['counters']),
  section: primitive('section', 'Section', 'square-stack', 'layout', ['section']),
  'side-by-side': primitive('side-by-side', 'Side by side', 'columns-3', 'layout', ['row']),
  tabs: primitive('tabs', 'Tabs', 'panel-top', 'layout', ['tabs']),
  divider: primitive('divider', 'Divider', 'minus', 'layout', ['divider']),
  picture: primitive('picture', 'Picture', 'image', 'media', ['image']),
};

export const PRIMITIVE_IDS: readonly PrimitiveId[] = Object.keys(PRIMITIVES) as PrimitiveId[];

export interface BlockSpec {
  type: BlockType;
  /** The primitive it is; null for the blocks that only ever come from a file. */
  primitive: PrimitiveId | null;
  /** Its primitive's label (Type ids never change), or its own where it has no primitive. */
  label: string;
  /** What sets it apart among its primitive's kinds ("A name and text"); unset where the primitive has one kind. */
  kind?: string;
  icon: BlockIcon;
  /** Field types the block's own field (each of a Line's fields) may have; empty where it binds none. */
  binds: readonly FieldType[];
  authorable: boolean;
  /** null: a Divider exports as `hasRule` on the block before it, an unknown block as it was read. */
  fsType: FsBlockType | null;
  /** Its size inside a Row while `size` is unset. */
  rowSize: 'fit' | 'fill';
}

const SCALAR_FIELDS: readonly FieldType[] = ['text', 'number', 'rating', 'dice', 'choice'];

function spec(
  type: AuthorableBlockType, of: PrimitiveId, binds: readonly FieldType[], fsType: FsBlockType | null, rowSize: 'fit' | 'fill', kind?: string,
): BlockSpec {
  const { label, icon } = PRIMITIVES[of];
  return { type, primitive: of, label, ...(kind && { kind }), icon, binds, authorable: true, fsType, rowSize };
}

function fileOnly(type: BlockType, label: string, icon: BlockIcon, fsType: FsBlockType | null): BlockSpec {
  return { type, primitive: null, label, icon, binds: [], authorable: false, fsType, rowSize: 'fill' };
}

export const BLOCK_CATALOGUE: Readonly<Record<BlockType, BlockSpec>> = {
  section: spec('section', 'section', [], 'group', 'fill'),
  row: spec('row', 'side-by-side', [], 'inline', 'fill'),
  tabs: spec('tabs', 'tabs', [], 'group', 'fill'),
  title: spec('title', 'heading', ['text'], 'heading', 'fill', 'From a property'),
  line: spec('line', 'line', SCALAR_FIELDS, 'subheading', 'fill'),
  stat: spec('stat', 'value', SCALAR_FIELDS, 'property', 'fit'),
  // Labels over values, as Fantasy Statblocks draws a table of ability scores.
  metric: spec('metric', 'metric', SCALAR_FIELDS, 'table', 'fill'),
  scores: spec('scores', 'table', ['scores'], 'table', 'fill'),
  tags: spec('tags', 'list', ['list'], 'property', 'fill', 'A word'),
  text: spec('text', 'text', ['markdown'], 'text', 'fill'),
  entries: spec('entries', 'list', ['entries'], 'traits', 'fill', 'A name and text'),
  pairs: spec('pairs', 'list', ['pairs'], 'saves', 'fill', 'A label and a value'),
  track: spec('track', 'track', ['number'], 'property', 'fit'),
  counters: spec('counters', 'counters', ['counters'], 'property', 'fill'),
  image: spec('image', 'picture', ['image'], 'image', 'fit'),
  spells: spec('spells', 'list', ['spells'], 'spells', 'fill', 'A group with items'),
  heading: spec('heading', 'heading', [], 'text', 'fill', 'Typed'),
  divider: spec('divider', 'divider', [], null, 'fill'),
  script: fileOnly('script', 'Kept from Fantasy Statblocks', 'code', 'javascript'),
  opaque: fileOnly('opaque', 'From a newer Atlas', 'circle-help', null),
};

export const BLOCK_TYPES: readonly BlockType[] = Object.keys(BLOCK_CATALOGUE) as BlockType[];

export const AUTHORABLE_BLOCK_TYPES: readonly AuthorableBlockType[] =
  BLOCK_TYPES.filter((type): type is AuthorableBlockType => BLOCK_CATALOGUE[type].authorable);

export function isAuthorableBlockType(type: BlockType): type is AuthorableBlockType {
  return BLOCK_CATALOGUE[type].authorable;
}

export function blockSpec(type: BlockType): BlockSpec {
  return BLOCK_CATALOGUE[type];
}

/** The primitive a block type is, or null for the blocks that only ever come from a file. */
export function primitiveOf(type: AuthorableBlockType): PrimitiveSpec;
export function primitiveOf(type: BlockType): PrimitiveSpec | null;
export function primitiveOf(type: BlockType): PrimitiveSpec | null {
  const id = BLOCK_CATALOGUE[type].primitive;
  return id === null ? null : PRIMITIVES[id];
}

export function bindsFieldType(type: BlockType, fieldType: FieldType): boolean {
  return BLOCK_CATALOGUE[type].binds.includes(fieldType);
}

/** A block's size inside a Row: its own `size`, else its type's default. */
export function rowSizeOf(block: TemplateBlock): 'fit' | 'fill' {
  return block.size ?? BLOCK_CATALOGUE[block.type].rowSize;
}

/** Where a block sits: at the root, or inside a block of this type. */
export type ParentType = 'root' | BlockType;

/**
 * The root and a Section take every block, a Row every block but a Row (a Row
 * already wraps) and Tabs, Tabs only Sections (one per tab), and no other
 * block holds children. That a block is never placed inside itself is the
 * tree's rule (`treeOps`), not the catalogue's.
 */
export function canContain(parent: ParentType, child: BlockType): boolean {
  if (parent === 'root' || parent === 'section') return true;
  if (parent === 'row') return child !== 'row' && child !== 'tabs';
  if (parent === 'tabs') return child === 'section';
  return false;
}

/** The label a new tab gets: "Tab 3" for the third. */
export function tabLabel(position: number): string {
  return `Tab ${position}`;
}

const NATURAL_BLOCKS: Readonly<Record<FieldType, AuthorableBlockType>> = {
  text: 'stat', number: 'stat', rating: 'stat', dice: 'stat', choice: 'stat',
  markdown: 'text', list: 'tags', scores: 'scores', entries: 'entries', pairs: 'pairs', image: 'image', spells: 'spells',
  counters: 'counters',
};

/** The block a field of this type gets when it is dragged onto the canvas or shown by the auto template. */
export function naturalBlockFor(fieldType: FieldType): AuthorableBlockType {
  return NATURAL_BLOCKS[fieldType];
}

type BlockOfType<T extends BlockType> = Extract<TemplateBlock, { type: T }>;

/**
 * A new block with its type's defaults. A block that binds a field shows
 * `fieldKey`; without one it is unbound (`''`) until its label is committed
 * (§7.6), except a Title, which shows `name`, and an Image, which shows `image`.
 */
export function createBlock<T extends AuthorableBlockType>(type: T, nextId: BlockIdSource, fieldKey?: FieldKey): BlockOfType<T>;
export function createBlock(type: AuthorableBlockType, nextId: BlockIdSource, fieldKey?: FieldKey): TemplateBlock {
  const id = nextId();
  const field = fieldKey ?? '';
  switch (type) {
    case 'section': return { id, type, blocks: [] };
    case 'row': return { id, type, blocks: [] };
    case 'tabs': return {
      id, type, blocks: [1, 2].map((position) => ({ id: nextId(), type: 'section', heading: tabLabel(position), blocks: [] })),
    };
    case 'title': return { id, type, field: fieldKey ?? 'name', level: 1 };
    case 'line': return { id, type, fields: fieldKey ? [fieldKey] : [] };
    case 'stat': return { id, type, field, look: 'run-in' };
    case 'metric': return { id, type, fields: [field] };
    case 'scores': return { id, type, field, orientation: 'row' };
    case 'tags': return { id, type, field, look: 'comma' };
    case 'text': return { id, type, field };
    case 'entries': return { id, type, field };
    case 'pairs': return { id, type, field };
    case 'track': return { id, type, field, look: 'boxes', counts: 'down' };
    case 'counters': return { id, type, field };
    case 'image': return { id, type, field: fieldKey ?? 'image', shape: 'token' };
    case 'spells': return { id, type, field };
    case 'heading': return { id, type, text: 'Heading', level: 'section' };
    case 'divider': return { id, type };
  }
}
