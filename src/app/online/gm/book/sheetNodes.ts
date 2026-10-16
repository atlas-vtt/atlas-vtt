import { MAX_ABILITY_TABS, MAX_BOOK_TITLE, MAX_SHEET_DEPTH, type AbilityComponent, type SheetNode } from '../../protocol/index.ts';
import { abilityFieldKeys } from '../../../statblocks/model/abilityParts';
import { tabLabel } from '../../../statblocks/model/blockCatalogue';
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

/** What walking a layout collects besides the sheet's nodes: its Abilities components in reading order, and blocks drawn elsewhere (a sigil). */
export interface SheetWalk {
  readonly abilities: AbilityComponent[];
  readonly drawnElsewhere: ReadonlySet<string>;
}

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
    const nodes = sheetNodes(build, tab.blocks, depth, { section: tab }, walk);
    return nodes.length === 0 ? [] : [{ label: clippedLine(sectionHeading(tab, build.shown), MAX_BOOK_TITLE) ?? tabLabel(index + 1), nodes }];
  }).slice(0, MAX_ABILITY_TABS);
}

/** One block as the sheet draws it: nodes in its place (none, or a container's flattened where the sheet would nest too deep). */
function blockNodes(build: SheetBuild, block: TemplateBlock, depth: number, section: SectionBlock | null, walk: SheetWalk): SheetNode[] {
  if (walk.drawnElsewhere.has(block.id) || !build.holds(block)) return [];
  const access = blockAccess(build.template, block);
  if (access === 'hidden') return [];
  if (abilityFieldKeys(block).length > 0 && (block.type === 'entries' || block.type === 'tabs')) {
    const component = abilityComponent(build, block, { section }, access === 'edit' && build.editable ? 'edit' : 'read');
    if (component) walk.abilities.push(component);
    return [];
  }
  const flat = depth >= MAX_SHEET_DEPTH;
  switch (block.type) {
    case 'spells': {
      const component = spellsComponent(build, block);
      if (component) walk.abilities.push(component);
      return [];
    }
    case 'section': {
      const nodes = sheetNodes(build, block.blocks, flat ? depth : depth + 1, { section: block }, walk);
      const title = sectionHeading(block, build.shown).trim();
      if (nodes.length === 0) return [];
      return flat ? [...heading(title), ...nodes] : [{ k: 'section', heading: clippedLine(title, MAX_BOOK_TITLE), nodes }];
    }
    case 'row': {
      const nodes = sheetNodes(build, block.blocks, flat ? depth : depth + 1, { section: null }, walk);
      return nodes.length === 0 ? [] : flat ? nodes : [{ k: 'row', nodes }];
    }
    case 'tabs': {
      const tabs = tabsOf(build, block, flat ? depth : depth + 1, walk);
      if (tabs.length === 0) return [];
      if (flat) return tabs.flatMap((tab) => [...heading(tab.label), ...tab.nodes]);
      return [{ k: 'tabs', heading: clippedLine(block.heading, MAX_BOOK_TITLE), tabs }];
    }
    default: {
      const display = sheetDisplay(build, block);
      const node = display ? leafNode(build, block, display) : null;
      return node ? [node] : [];
    }
  }
}

/**
 * The blocks of a list as the player's sheet draws them, in the template's order: what the template
 * lets players see, as the card shows it. Abilities components and spell lists go to the Abilities
 * tab (`walk.abilities`), pictures and code are left out, and a rule the blocks around it left at
 * an edge or under another rule is not drawn, as on the card.
 */
export function sheetNodes(build: SheetBuild, blocks: readonly TemplateBlock[], depth: number, place: { section: SectionBlock | null }, walk: SheetWalk): SheetNode[] {
  const drawn = new Map(blocks.map((block) => [block.id, blockNodes(build, block, depth, place.section, walk)]));
  const stranded = strandedDividers(blocks, (block) => (drawn.get(block.id)?.length ?? 0) > 0);
  return blocks.flatMap((block) => (stranded.has(block.id) ? [] : drawn.get(block.id) ?? []));
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
