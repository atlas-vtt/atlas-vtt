import {
  bindsFieldType, canContain, createBlock, isAuthorableBlockType, type AuthorableBlockType,
} from './blockCatalogue';
import { fieldByKey } from './fieldKeys';
import { done, parentTypeOf, refuse, spliced, withChildren, type TreeEdit } from './treeEdit';
import { boundField, findBlock } from './treeQueries';
import {
  ADDS_TO_ROLLS_TYPES, isContainerBlock, isContainerType, type BlockBase, type ContainerType, type BlockType, type TemplateBlock, type TemplateField, type TemplateLayout,
} from './templateTypes';

type CommonProps = Partial<Pick<BlockBase, 'showWhen' | 'whenEmpty' | 'fallback' | 'className' | 'size'>>;

/** Settings every block has that mean the same after a change of type; `fsExtras` belong to the old FS type. */
function commonProps(block: TemplateBlock): CommonProps {
  const kept: CommonProps = {};
  if (block.showWhen) kept.showWhen = block.showWhen;
  if (block.whenEmpty) kept.whenEmpty = block.whenEmpty;
  if (block.fallback !== undefined) kept.fallback = block.fallback;
  if (block.className !== undefined) kept.className = block.className;
  if (block.size) kept.size = block.size;
  return kept;
}

/** Settings that read alike in several block types, and the types that have them. */
const CARRIED: ReadonlyArray<readonly [key: string, types: readonly BlockType[]]> = [
  ['label', ['stat', 'tags', 'pairs', 'track']],
  ['heading', ['text', 'entries', 'spells']],
  ['display', ['stat', 'pairs', 'scores']],
  ['addsToRolls', ADDS_TO_ROLLS_TYPES],
];
const PATTERN_TYPES: readonly BlockType[] = ['title', 'line', 'stat'];

/** The words a List writes over its items: a list of words or labels has a label, the others a heading. */
const LIST_LABEL_KEY: Partial<Record<BlockType, 'label' | 'heading'>> = { tags: 'label', pairs: 'label', entries: 'heading', spells: 'heading' };

/** A typed heading's text as the property it names, where the template has one a title can show. */
function fieldNamed(fields: readonly TemplateField[], text: string): string | undefined {
  const wanted = text.trim().toLowerCase();
  return fields.find((field) => field.label.trim().toLowerCase() === wanted && bindsFieldType('title', field.type))?.key;
}

/** What a Heading keeps when its text changes between typed and from a property: its words, and its size. */
function turnedHeading(block: TemplateBlock, turned: Record<string, unknown>, fields: readonly TemplateField[]): void {
  if (block.type === 'heading' && turned.type === 'title') {
    turned.field = fieldNamed(fields, block.text) ?? '';
    turned.level = block.level === 'minor' ? 3 : 2;
  }
  if (block.type === 'title' && turned.type === 'heading') {
    turned.text = fieldByKey(fields, block.field)?.label || block.field || turned.text;
    turned.level = block.level === 3 ? 'minor' : 'section';
  }
}

/** A List keeps the words over its items when its items change kind. */
function turnedListLabel(source: Readonly<Record<string, unknown>>, turned: Record<string, unknown>): void {
  const from = LIST_LABEL_KEY[source.type as BlockType];
  const to = LIST_LABEL_KEY[turned.type as BlockType];
  if (!from || !to || from === to) return;
  const words = source[from];
  if (typeof words === 'string' && words.trim()) turned[to] = words;
}

function turnedLeaf(block: TemplateBlock, type: AuthorableBlockType, fields: readonly TemplateField[]): TemplateBlock {
  const field = boundField(block);
  const fieldType = field ? fieldByKey(fields, field)?.type : undefined;
  const kept = field && fieldType && bindsFieldType(type, fieldType) ? field : undefined;
  const turned: Record<string, unknown> = { ...createBlock(type, () => block.id, kept), ...commonProps(block) };
  const source: Readonly<Record<string, unknown>> = { ...block };
  const carried = kept && PATTERN_TYPES.includes(type) ? [...CARRIED, ['pattern', PATTERN_TYPES] as const] : CARRIED;
  for (const [key, types] of carried) {
    if (types.includes(type) && types.includes(block.type) && source[key] !== undefined) turned[key] = source[key];
  }
  if (block.type === 'heading' && type === 'text') {
    delete turned.field;
    turned.text = block.text;
  }
  if (block.type === 'text' && type === 'heading') turned.text = block.text ?? block.heading ?? turned.text;
  turnedHeading(block, turned, fields);
  turnedListLabel(source, turned);
  return turned as unknown as TemplateBlock;
}

/**
 * Changes a block's type, keeping its id, its place and its field where the
 * new type binds that field's type (`fields` are the template's). Sections,
 * Rows and Tabs turn into each other with their children (a Section and Tabs
 * with their heading), where the new type takes them; other blocks into any
 * authorable block but those, keeping the label, heading, pattern and display
 * the new type shares.
 */
export function turnInto(
  layout: TemplateLayout, id: string, type: AuthorableBlockType, fields: readonly TemplateField[],
): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  const { block } = found;
  if (block.type === type) return done(layout, id);
  if (!isAuthorableBlockType(type) || isContainerBlock(block) !== isContainerType(type)) return refuse(layout, 'cannot-turn-into');
  const parentType = parentTypeOf(layout, found.parentId);
  if (parentType === null || !canContain(parentType, type)) return refuse(layout, 'not-allowed-here');
  let turned: TemplateBlock;
  if (isContainerBlock(block)) {
    if (block.blocks.some((child) => !canContain(type, child.type))) return refuse(layout, 'not-allowed-here');
    const base = { id, blocks: block.blocks, ...commonProps(block) };
    // A Section and a Tabs block both stand under a heading, which the other keeps.
    const heading = block.type === 'row' ? undefined : block.heading;
    const container = type as ContainerType;
    turned = container === 'row' ? { ...base, type: container } : { ...base, type: container, ...(heading !== undefined && { heading }) };
  } else {
    turned = turnedLeaf(block, type, fields);
  }
  return done(withChildren(layout, found.parentId, (children) => spliced(children, found.index, 1, turned)), id);
}
