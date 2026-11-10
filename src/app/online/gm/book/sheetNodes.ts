import { MAX_ABILITY_TABS, MAX_BOOK_TITLE, MAX_SHEET_DEPTH, type AbilityComponent, type SheetFrame, type SheetNode } from '../../protocol/index.ts';
import { abilityFieldKeys } from '../../../statblocks/model/abilityParts';
import { rowSizeOf, tabLabel } from '../../../statblocks/model/blockCatalogue';
import type { SectionBlock, TemplateBlock } from '../../../statblocks/model/templateTypes';
import { blockDisplay, type BlockDisplay } from '../../../statblocks/render/blockDisplay';
import { sectionHeading } from '../../../statblocks/render/values/sectionHeading';
import { strandedDividers } from '../../../statblocks/render/strandedDividers';
import { abilityComponent, spellsComponent } from './abilityComponents.ts';
import { clippedLine } from './bookTexts.ts';
import { blockAccess } from './playerAccess.ts';
import type { SheetBudget } from './sheetBudget.ts';
import type { SheetBuild } from './sheetFields.ts';
import { leafNode } from './sheetLeaves.ts';

/** What walking a layout collects besides the sheet's nodes: its Abilities components in reading order. */
export interface SheetWalk {
  readonly abilities: AbilityComponent[];
}

/** Where a list of blocks stands: in a Section (or a tab, whose Section it is), and whether its blocks are the tiles of a Row. */
export interface BlockPlace {
  readonly section: SectionBlock | null;
  readonly row: boolean;
}

/** Whether a block is an ability component, which the Abilities tab shows and the sheet leaves out. */
export function isAbilityBlock(block: TemplateBlock): boolean {
  return block.type === 'spells' || (abilityFieldKeys(block).length > 0 && (block.type === 'entries' || block.type === 'tabs'));
}

/** The look the card gives a block, as a word (`SheetFrame.look`). */
function lookOf(block: TemplateBlock): string | undefined {
  switch (block.type) {
    case 'stat': case 'tags': case 'track': return block.look;
    case 'scores': return block.orientation;
    case 'title': return `h${block.level}`;
    case 'heading': return block.level;
    default: return undefined;
  }
}

/** How the card lays out a block (`SheetFrame`): its type and look, its size where it is a Row's tile, a Row's alignment. */
export function frameOf(block: TemplateBlock, inRow: boolean): SheetFrame {
  const look = lookOf(block);
  return {
    block: block.type,
    ...(look !== undefined && { look }),
    ...(inRow && { size: rowSizeOf(block) }),
    ...(block.type === 'row' && block.align !== undefined && { align: block.align }),
  };
}

const framed = (node: SheetNode, block: TemplateBlock, place: BlockPlace): SheetNode => ({ ...node, frame: frameOf(block, place.row) });

/** A block without its condition: the GM has decided it, so the texts are worked out without reading what it reads. */
function unconditioned(block: TemplateBlock): TemplateBlock {
  if (block.showWhen === undefined) return block;
  const copy = { ...block };
  delete copy.showWhen;
  return copy;
}

/**
 * How a block shows on the player's sheet: as the card shows it to a reader, else, where it is
 * empty and the player may fill it in, with the prompt the note's panel shows.
 */
export function sheetDisplay(build: SheetBuild, block: TemplateBlock): BlockDisplay | null {
  const own = unconditioned(block);
  const shown = blockDisplay(own, build.shown);
  if (shown || !build.editable || blockAccess(build.template, block) !== 'edit') return shown;
  const editing = blockDisplay(own, build.editing);
  return editing?.state === 'prompt' ? editing : null;
}

const heading = (text: string): SheetNode[] => {
  const line = clippedLine(text, MAX_BOOK_TITLE);
  return line === null ? [] : [{ k: 'heading', text: line, minor: false }];
};

/** The Sections of a Tabs block that show, each with what it holds. */
function tabsOf(build: SheetBuild, block: Extract<TemplateBlock, { type: 'tabs' }>, depth: number, walk: SheetWalk): { label: string; nodes: SheetNode[] }[] {
  return block.blocks.flatMap((tab, index) => {
    if (tab.type !== 'section' || !build.holds(tab)) return [];
    const nodes = sheetNodes(build, tab.blocks, depth, { section: tab, row: false }, walk);
    return nodes.length === 0 ? [] : [{ label: clippedLine(sectionHeading(tab, build.shown), MAX_BOOK_TITLE) ?? tabLabel(index + 1), nodes }];
  }).slice(0, MAX_ABILITY_TABS);
}

/** One block as the sheet draws it: nodes in its place (none, or a container's flattened where the sheet would nest too deep). */
function blockNodes(build: SheetBuild, block: TemplateBlock, depth: number, place: BlockPlace, walk: SheetWalk): SheetNode[] {
  if (!build.holds(block)) return [];
  const access = blockAccess(build.template, block);
  if (access === 'hidden') return [];
  if (block.type === 'spells') {
    const component = spellsComponent(build, block, place);
    if (component) walk.abilities.push(component);
    return [];
  }
  if (isAbilityBlock(block) && (block.type === 'entries' || block.type === 'tabs')) {
    const component = abilityComponent(build, block, place, access === 'edit' && build.editable ? 'edit' : 'read');
    if (component) walk.abilities.push(component);
    return [];
  }
  const flat = depth >= MAX_SHEET_DEPTH;
  switch (block.type) {
    case 'section': {
      const nodes = sheetNodes(build, block.blocks, flat ? depth : depth + 1, { section: block, row: false }, walk);
      const title = sectionHeading(block, build.shown).trim();
      if (nodes.length === 0) return [];
      return flat ? [...heading(title), ...nodes] : [framed({ k: 'section', heading: clippedLine(title, MAX_BOOK_TITLE), nodes }, block, place)];
    }
    case 'row': {
      // A tile that went to the Abilities tab leaves no gap: the others share the row, as on the card where a tile does not show
      const nodes = sheetNodes(build, block.blocks, flat ? depth : depth + 1, { section: place.section, row: !flat }, walk);
      return nodes.length === 0 ? [] : flat ? nodes : [framed({ k: 'row', nodes }, block, place)];
    }
    case 'tabs': {
      const tabs = tabsOf(build, block, flat ? depth : depth + 1, walk);
      if (tabs.length === 0) return [];
      if (flat) return tabs.flatMap((tab) => [...heading(tab.label), ...tab.nodes]);
      return [framed({ k: 'tabs', heading: clippedLine(block.heading, MAX_BOOK_TITLE), tabs }, block, place)];
    }
    default: {
      const display = sheetDisplay(build, block);
      const node = display ? leafNode(build, block, display) : null;
      return node ? [framed(node, block, place)] : [];
    }
  }
}

/**
 * The Heading blocks that head nothing once the abilities left: a heading whose run (the blocks
 * after it up to the next heading, Section or the list's end) held an ability component and now draws
 * nothing but rules.
 */
function emptiedHeadings(blocks: readonly TemplateBlock[], draws: (block: TemplateBlock) => boolean): ReadonlySet<string> {
  const emptied = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.type !== 'heading') return;
    const end = blocks.findIndex((later, at) => at > index && (later.type === 'heading' || later.type === 'section'));
    const run = blocks.slice(index + 1, end === -1 ? blocks.length : end);
    // A rule heads nothing: it is drawn or dropped by the card's own rule afterwards
    if (run.some(isAbilityBlock) && !run.some((later) => later.type !== 'divider' && draws(later))) emptied.add(block.id);
  });
  return emptied;
}

/**
 * The blocks of a list as the player's sheet draws them, in the template's order, each with how the
 * card lays it out (`frame`): what the template lets players see, as the card shows it. Abilities
 * components and spell lists go to the Abilities tab (`walk.abilities`), pictures and code are left
 * out; a heading left with nothing under it once the abilities went, and a rule the blocks around it
 * left at an edge or under another rule, are not drawn, as on the card.
 */
export function sheetNodes(build: SheetBuild, blocks: readonly TemplateBlock[], depth: number, place: BlockPlace, walk: SheetWalk): SheetNode[] {
  const drawn = new Map(blocks.map((block) => [block.id, blockNodes(build, block, depth, place, walk)]));
  const draws = (block: TemplateBlock): boolean => (drawn.get(block.id)?.length ?? 0) > 0;
  const emptied = emptiedHeadings(blocks, draws);
  const shows = (block: TemplateBlock): boolean => draws(block) && !emptied.has(block.id);
  const stranded = strandedDividers(blocks, shows);
  return blocks.flatMap((block) => (stranded.has(block.id) || !shows(block) ? [] : drawn.get(block.id) ?? []));
}

/** The nodes that fit the budget, taken in the order the page's parser reads them (depth first); a container that does not fit goes with what it holds. */
export function fittedNodes(budget: SheetBudget, nodes: readonly SheetNode[]): SheetNode[] {
  return nodes.flatMap((node): SheetNode[] => {
    if (!budget.takeNode(node)) return [];
    switch (node.k) {
      case 'section': case 'row': return [{ ...node, nodes: fittedNodes(budget, node.nodes) }];
      case 'tabs': return [{ ...node, tabs: node.tabs.map((tab) => ({ ...tab, nodes: fittedNodes(budget, tab.nodes) })) }];
      default: return [node];
    }
  });
}
