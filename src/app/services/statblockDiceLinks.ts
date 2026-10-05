/**
 * Click-to-roll dice notation, routed through Atlas' own dice tool (toast, roll
 * log).
 *
 * Two halves, deliberately separate:
 *
 * - `linkDiceIn` rewrites text nodes into clickable spans. It must ONLY be used
 *   on static DOM that Atlas produced and owns — currently the output of
 *   Obsidian's MarkdownRenderer, which is rebuilt wholesale on every render.
 *   Never point it at DOM owned by React or Svelte: those frameworks hold
 *   references to the text nodes it replaces, and throw on their next update.
 * - `attachDiceRolling` only listens for clicks, so it is safe on any container.
 */

import type { App } from 'obsidian';
import type { DiceRollResult } from '../tools/DiceTool';
import { ATLAS_VIEW_TYPE } from '../atlas-view';
import { t } from '../i18n';

/**
 * Dice expressions (`2d8+3`) plus bare attack bonuses (`+4`, `ATK: +4`). A
 * bare sign must sit directly on its digits and must not open a dice term, so
 * the dash in "Very Close - 1d12+2" is punctuation rather than a -1 roll.
 *
 * Dice may carry the exploding notation (`1d6!i`, `1d6!3`, `1d6!!`). A single
 * `!` is left out: in running text it ends a sentence far more often than it
 * means a die that explodes once.
 */
const DICE_PATTERN =
  /((?<![a-z])\d*d\d+(?:!!?(?:\d+|i(?![a-z]))|!!)?(?:\s*[+-]\s*\d+)*|(?:ATK|Attack)\s*:\s*[+-]\d+|(?<!\w)[+-]\d+(?!\s*d\d))/gi;

const LINK_CLASS = 'atlas-dice-link';

/** Set by the statblock renderer on the line that holds a creature's hit points. */
const HIT_POINTS_SELECTOR = '[data-hit-points]';

/** Elements whose text must never be rewritten. */
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'BUTTON']);

export interface DiceRollSource {
  tokenId?: string | undefined;
  statblockPath?: string | undefined;
  tokenName?: string | undefined;
  tokenImagePath?: string | undefined;
  abilityName?: string | undefined;
}

/** Receives clicks on hit dice, in place of the ordinary roll. */
export type HitPointsRollHandler = (formula: string, abilityName: string | undefined) => void;

interface DiceToolLike {
  rollDice(formula: string, source?: DiceRollResult['source']): DiceRollResult | null;
}

/**
 * Resolves Atlas' dice tool from the open map view. Returns null when no map is
 * open, in which case dice are left as plain text.
 */
function resolveDiceTool(app: App): DiceToolLike | null {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const view = leaf.view as unknown as {
      serviceManager?: { getToolController?: () => { getDiceTool?: () => DiceToolLike } };
    };
    const diceTool = view?.serviceManager?.getToolController?.()?.getDiceTool?.();
    if (diceTool) return diceTool;
  }
  return null;
}

/**
 * Rolls through the dice tool of the open map, tagged with its statblock source.
 * Returns null when no map is open.
 */
export function rollStatblockDice(app: App, formula: string, source: DiceRollSource): DiceRollResult | null {
  const diceTool = resolveDiceTool(app);
  if (!diceTool) return null;

  const rollSource: NonNullable<DiceRollResult['source']> = { type: 'statblock' };
  if (source.tokenId) rollSource.tokenId = source.tokenId;
  if (source.statblockPath) rollSource.statblockPath = source.statblockPath;
  if (source.tokenName) rollSource.tokenName = source.tokenName;
  if (source.tokenImagePath) rollSource.tokenImagePath = source.tokenImagePath;
  if (source.abilityName) rollSource.abilityName = source.abilityName;

  return diceTool.rollDice(formula, rollSource);
}

/**
 * Turns matched display text into a formula the dice tool understands. A bare
 * bonus stays bare: the dice tool adds it to the collection's default roll.
 */
export function toRollFormula(text: string): string {
  return text.replace(/\s+/g, '').replace(/^(?:ATK|Attack):/i, '');
}

/** Nearest heading-ish label above the roll, used to title the dice toast. */
function abilityNameFor(node: Node): string | undefined {
  const el = node.parentElement?.closest<HTMLElement>(
    '.atlas-sb-trait, .atlas-sb-property, li, p, tr',
  );
  const name = el?.querySelector<HTMLElement>(
    '.atlas-sb-trait-name, .atlas-sb-property-name, strong, em, b, i',
  )?.textContent;
  return name?.trim().replace(/[:.]$/, '') || undefined;
}

function isSkipped(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  if (parent.closest(`.${LINK_CLASS}`)) return true;
  return SKIPPED_TAGS.has(parent.tagName);
}

function linkTextNode(textNode: Text): void {
  const text = textNode.nodeValue ?? '';
  DICE_PATTERN.lastIndex = 0;
  if (!DICE_PATTERN.test(text)) return;

  DICE_PATTERN.lastIndex = 0;
  const fragment = createFragment();
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = DICE_PATTERN.exec(text)) !== null) {
    const [matched] = match;
    if (match.index > cursor) {
      fragment.append(text.slice(cursor, match.index));
    }

    const link = createSpan();
    link.className = LINK_CLASS;
    link.textContent = matched;
    link.dataset.formula = toRollFormula(matched);
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.setAttribute('aria-label', t('dice.rollFormula', { formula: link.dataset.formula ?? '' }));
    fragment.append(link);

    cursor = match.index + matched.length;
  }

  if (cursor < text.length) {
    fragment.append(text.slice(cursor));
  }
  textNode.replaceWith(fragment);
}

/**
 * Wraps dice notation in `root` with clickable spans.
 * Only safe on static, Atlas-owned DOM — see the note at the top of this file.
 */
export function linkDiceIn(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });

  const targets: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    targets.push(current as Text);
    current = walker.nextNode();
  }

  targets.forEach((textNode) => linkTextNode(textNode));
}

/**
 * Wires click-to-roll into a container. Listens only — the dice spans
 * themselves are produced by the renderer (or by `linkDiceIn` on static DOM),
 * so this never mutates the container. Returns a disposer.
 *
 * Dice on the hit-points line go to `onRollHitPoints` when one is given.
 */
export function attachDiceRolling(
  el: HTMLElement,
  app: App,
  getSource: () => DiceRollSource,
  onRollHitPoints?: HitPointsRollHandler,
): () => void {
  const roll = (link: HTMLElement): void => {
    const formula = link.dataset.formula;
    if (!formula) return;

    const abilityName = abilityNameFor(link);
    if (onRollHitPoints && /d\d/i.test(formula) && link.closest(HIT_POINTS_SELECTOR)) {
      onRollHitPoints(formula, abilityName);
      return;
    }

    rollStatblockDice(app, formula, { ...getSource(), abilityName });
  };

  const onClick = (event: MouseEvent): void => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(`.${LINK_CLASS}`);
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    roll(link);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(`.${LINK_CLASS}`);
    if (!link) return;
    event.preventDefault();
    roll(link);
  };

  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKeyDown);

  return () => {
    el.removeEventListener('click', onClick);
    el.removeEventListener('keydown', onKeyDown);
  };
}

/** Shared attributes for a clickable dice span, used by DOM and React paths. */
export function diceLinkProps(matched: string): {
  className: string;
  'data-formula': string;
  role: string;
  tabIndex: number;
  'aria-label': string;
} {
  const formula = toRollFormula(matched);
  return {
    className: LINK_CLASS,
    'data-formula': formula,
    role: 'button',
    tabIndex: 0,
    'aria-label': t('dice.rollFormula', { formula }),
  };
}

/** Splits text into plain and dice segments, for renderers that build their own nodes. */
export function splitDiceSegments(text: string): Array<{ text: string; dice: boolean }> {
  const segments: Array<{ text: string; dice: boolean }> = [];
  DICE_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = DICE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), dice: false });
    }
    segments.push({ text: match[0], dice: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), dice: false });
  }
  return segments;
}
