import { isResourceKey, MAX_BOOK_TITLE, type SheetNode, type SheetSigils, type SheetValue } from '../../protocol/index.ts';
import { isHitPointsKey } from '../../../resources/resourceFields';
import { shownHeaderParts, type HeaderPart } from '../../../statblocks/model/templateHeader';
import { isContainerBlock, type FieldKey, type StatBlock, type TemplateBlock } from '../../../statblocks/model/templateTypes';
import { valueText } from '../../../statblocks/values/valueText';
import { clippedLine } from './bookTexts.ts';
import { blockAccess } from './playerAccess.ts';
import type { SheetBuild } from './sheetFields.ts';
import { displayText, labelOf, leafNode, plainValue, promptOf, sheetValue, shownFieldOf } from './sheetLeaves.ts';
import { rollableBlock } from './sheetRolls.ts';
import { sheetDisplay } from './sheetNodes.ts';

/** What the header gives the sheet: the name it shows, the sigils beside the portrait, and its description, which leads the sheet. */
export interface SheetHead {
  readonly displayName: string | null;
  /** In the order the page's parser reads them. */
  readonly sigils: readonly (readonly [keyof SheetSigils, SheetValue])[];
  readonly description: SheetNode | null;
  /** The layout's block the armour sigil shows, so the sheet does not show it again. */
  readonly armorBlock: string | null;
}

/** The character's resource whose maximum is the hit points the header shows, where the token holds it. */
function hitPointsResource(build: SheetBuild, key: FieldKey): string | undefined {
  const definition = build.definitions.find((each) => each.field === key || (isHitPointsKey(each.field) && isHitPointsKey(key)));
  return definition && isResourceKey(definition.key) && build.resources[definition.key] ? definition.key : undefined;
}

/** One part of the header as a sigil: its name over its value, editable where the player may change it. */
function partSigil(build: SheetBuild, part: HeaderPart): SheetValue | null {
  if (blockAccess(build.template, part.block) === 'hidden') return null;
  const display = sheetDisplay(build, part.block);
  if (!display) return null;
  const text = part.block.type === 'track' && display.state === 'value' ? valueText(build.shown.reader(part.key)) : displayText(display);
  const resource = part.id === 'hp' ? hitPointsResource(build, part.key) : undefined;
  return sheetValue(build, part.label, text, 'plain', shownFieldOf(build, part.key, part.block, display), promptOf(display), { rollable: rollableBlock(part.block), ...(resource && { resource }) });
}

/** The first Stat of the layout that shows the armour, where its blocks around it show too. */
function armorBlock(build: SheetBuild, blocks: readonly TemplateBlock[], key: FieldKey): StatBlock | null {
  for (const block of blocks) {
    if (!build.holds(block)) continue;
    if (block.type === 'stat' && block.field === key) return block;
    const inner = isContainerBlock(block) ? armorBlock(build, block.blocks, key) : null;
    if (inner) return inner;
  }
  return null;
}

function armorSigil(build: SheetBuild): { sigil: SheetValue; block: string } | null {
  const key = build.template.fields.find((field) => field.meaning === 'armor')?.key;
  const block = key === undefined ? null : armorBlock(build, build.template.layout.blocks, key);
  if (!block || blockAccess(build.template, block) === 'hidden') return null;
  const display = sheetDisplay(build, block);
  if (!display) return null;
  return { block: block.id, sigil: plainValue(build, labelOf(build, block), display, shownFieldOf(build, block.field, block, display), rollableBlock(block)) };
}

/**
 * The header as the sheet draws it (`templateHeader.ts`): the name it shows, hit points, armour,
 * level and type as sigils, and the description. A part the template hides, or that reads a value
 * the player may not see, is left out; the token art is the portrait the page already shows.
 */
export function sheetHead(build: SheetBuild): SheetHead {
  const parts = new Map(shownHeaderParts(build.template).map((part) => [part.id, part]));
  const name = parts.get('name');
  const nameDisplay = name && blockAccess(build.template, name.block) !== 'hidden' ? sheetDisplay(build, name.block) : null;
  const description = parts.get('description');
  const descriptionDisplay = description && blockAccess(build.template, description.block) !== 'hidden' ? sheetDisplay(build, description.block) : null;
  const armor = armorSigil(build);
  const sigilOf = (id: 'hp' | 'level' | 'type'): SheetValue | null => {
    const part = parts.get(id);
    return part ? partSigil(build, part) : null;
  };
  const sigils: [keyof SheetSigils, SheetValue | null][] = [['hp', sigilOf('hp')], ['armor', armor?.sigil ?? null], ['level', sigilOf('level')], ['type', sigilOf('type')]];
  return {
    displayName: nameDisplay && nameDisplay.state !== 'prompt' ? clippedLine(displayText(nameDisplay), MAX_BOOK_TITLE) : null,
    sigils: sigils.flatMap(([id, sigil]) => (sigil ? [[id, sigil] as const] : [])),
    description: description && descriptionDisplay ? leafNode(build, description.block, descriptionDisplay) : null,
    armorBlock: armor?.block ?? null,
  };
}
