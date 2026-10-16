import {
  bookLine, isFieldKey, MAX_ABILITY_PARTS, MAX_ABILITY_TABS, MAX_BOOK_TITLE, MAX_SHEET_OPTIONS, parseSheetRaw, sheetItemKeys,
  type AbilityComponent, type AbilityEntry, type AbilityPart, type AbilityTab, type SheetRaw,
} from '../../protocol/index.ts';
import { tabLabel } from '../../../statblocks/model/blockCatalogue';
import type { EntriesBlock, EntryShape, SectionBlock, SpellsBlock, TabsBlock } from '../../../statblocks/model/templateTypes';
import { sectionHeading } from '../../../statblocks/render/values/sectionHeading';
import { spellEntries, spellGroups, type SpellLine } from '../../../statblocks/render/shared/spellGroups';
import { keyedEntryItems } from '../../../statblocks/values/entryKeys';
import { entryName, entryText } from '../../../statblocks/values/entryValues';
import { toFieldValue } from '../../../statblocks/values/fieldValueOf';
import { readField } from '../../../statblocks/values/fieldValues';
import { splitListText } from '../../../statblocks/values/listText';
import { valueText } from '../../../statblocks/values/valueText';
import { clippedLine } from './bookTexts.ts';
import type { SheetBuild } from './sheetFields.ts';

/** A component's id: its block's, where that is one a page takes, else a hash of it. */
const BLOCK_ID = /^[0-9a-z]{1,16}$/;

/** The one list of a tab, or of an entries block itself. */
type ListOf = { readonly label: string | null; readonly block: EntriesBlock };

/** Where an Abilities component stands: the Section around it, which names it where it holds nothing else. */
export interface ComponentPlace {
  readonly section: SectionBlock | null;
}

function componentId(id: string): string {
  return BLOCK_ID.test(id) ? id : (sheetItemKeys([id])[0] ?? '0~0').split('~')[0] ?? '0';
}

/** The parts every ability of a list has, as the template shapes them; a part a page cannot take is left out. */
function abilityParts(shape: EntryShape | undefined): AbilityPart[] {
  return (shape?.extras ?? []).flatMap((extra): AbilityPart[] => {
    if (!isFieldKey(extra.key)) return [];
    const options = extra.options?.slice(0, MAX_SHEET_OPTIONS).flatMap((option) => bookLine(option, MAX_BOOK_TITLE) ?? []);
    return [{
      key: extra.key,
      label: clippedLine(extra.label, MAX_BOOK_TITLE) ?? extra.key,
      type: extra.type,
      ...(options !== undefined && { options }),
      ...(extra.several === true && { several: true }),
    }];
  }).slice(0, MAX_ABILITY_PARTS);
}

/** The abilities of one list as the note holds them, each named by its key among the list's items (`entryItemKeys`). */
function abilityEntries(build: SheetBuild, block: EntriesBlock, parts: readonly AbilityPart[]): AbilityEntry[] {
  const field = build.shown.fields.get(block.field);
  if (!field) return [];
  const shape = field.entry;
  return keyedEntryItems(readField(build.record, field).value).map(({ item, key }): AbilityEntry => {
    const record = item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const values = parts.flatMap((part): [string, SheetRaw][] => {
      const value = record[part.key] === undefined ? undefined : parseSheetRaw(record[part.key]);
      return value === undefined ? [] : [[part.key, value]];
    });
    return {
      key,
      name: clippedLine(entryName(item, shape), MAX_BOOK_TITLE) ?? '',
      text: build.texts.of(entryText(item, shape) ?? ''),
      parts: Object.fromEntries(values),
    };
  });
}

/**
 * The name the GM gave a component: the Tabs block's heading, else the list's own heading, else
 * the heading of the Section around it where that holds only this list, else the list's label.
 */
function componentName(build: SheetBuild, outer: TabsBlock | EntriesBlock, place: ComponentPlace): string {
  const first = outer.type === 'tabs' ? listsOf(build, outer)[0]?.block : outer;
  const section = place.section && place.section.blocks.length === 1 ? sectionHeading(place.section, build.shown) : '';
  const label = first ? build.shown.fields.get(first.field)?.label : undefined;
  return clippedLine(outer.heading?.trim() || first?.heading?.trim() || section.trim() || label || 'Abilities', MAX_BOOK_TITLE) ?? 'Abilities';
}

/** The lists of an Abilities component: its one list, or one per tab whose condition holds. */
function listsOf(build: SheetBuild, block: TabsBlock | EntriesBlock): ListOf[] {
  if (block.type === 'entries') return [{ label: null, block }];
  return block.blocks.flatMap((tab, index): ListOf[] => {
    const list = tab.type === 'section' ? tab.blocks[0] : undefined;
    if (tab.type !== 'section' || list?.type !== 'entries' || !build.holds(tab)) return [];
    return [{ label: clippedLine(sectionHeading(tab, build.shown), MAX_BOOK_TITLE) ?? tabLabel(index + 1), block: list }];
  }).slice(0, MAX_ABILITY_TABS);
}

/**
 * An Abilities component as the player's Abilities tab shows it: under its GM-given name, with the
 * parts its abilities have and each of its lists. A list the player only reads keeps the tabs that
 * hold abilities; one they edit keeps every tab, since they may fill an empty one. Null where
 * nothing of it shows.
 */
export function abilityComponent(build: SheetBuild, block: TabsBlock | EntriesBlock, place: ComponentPlace, access: 'edit' | 'read'): AbilityComponent | null {
  const lists = listsOf(build, block);
  const first = lists[0] ? build.shown.fields.get(lists[0].block.field) : undefined;
  const parts = abilityParts(first?.entry);
  const tabs = lists.map(({ label, block: list }): AbilityTab => {
    const intro = list.introField ? valueText(build.shown.reader(list.introField)).trim() : '';
    return { label, list: list.field, ...(intro !== '' && { intro: build.texts.of(intro) }), entries: abilityEntries(build, list, parts) };
  }).filter((tab) => isFieldKey(tab.list) && (access === 'edit' || tab.entries.length > 0));
  if (tabs.length === 0) return null;
  const keys = { nameKey: first?.entry?.nameKey ?? 'name', textKey: first?.entry?.textKey ?? 'desc' };
  return { id: componentId(block.id), name: componentName(build, block, place), access, parts, tabs, ...keys };
}

/** One level line of a spell list as a tab, its spells by name. */
function levelTab(list: string, line: SpellLine): AbilityTab {
  const names = splitListText(line.spells).flatMap((spell) => clippedLine(spell, MAX_BOOK_TITLE) ?? []);
  const keys = sheetItemKeys(names);
  return {
    label: clippedLine(line.level ?? '', MAX_BOOK_TITLE),
    list,
    entries: names.map((spell, index): AbilityEntry => ({ key: keys[index] ?? '0~0', name: spell, text: { opening: '' }, parts: {} })),
  };
}

/**
 * A spell list in Fantasy Statblocks' shape, read only: one tab per level line, its spells by name.
 * A group's header line ("casts spells using Wisdom (save DC 12)") opens its first level's tab, as
 * the card shows it above its levels; a group without levels is a tab of its header line alone.
 */
export function spellsComponent(build: SheetBuild, block: SpellsBlock): AbilityComponent | null {
  const name = valueText(build.shown.reader('name')) || 'The creature';
  const groups = spellGroups(spellEntries(build.shown.reader(block.field)), `${name} knows the following spells:`, (value) => valueText(toFieldValue(value)));
  const tabs = groups.flatMap((group): AbilityTab[] => {
    const [first, ...rest] = group.spells.map((line) => levelTab(block.field, line)).filter((tab) => tab.entries.length > 0);
    const intro = build.texts.of(group.header);
    return first ? [{ ...first, intro }, ...rest] : [{ label: null, list: block.field, intro, entries: [] }];
  }).slice(0, MAX_ABILITY_TABS);
  if (tabs.length === 0 || !isFieldKey(block.field)) return null;
  const label = build.shown.fields.get(block.field)?.label;
  const heading = clippedLine(block.heading?.trim() || label || 'Spells', MAX_BOOK_TITLE) ?? 'Spells';
  return { id: componentId(block.id), name: heading, access: 'read', parts: [], tabs, spells: true };
}
