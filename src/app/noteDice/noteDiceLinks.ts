import { createDiceLink, linkDiceIn } from '../services/statblockDiceLinks';
import { parseFormula } from '../tools/parseFormula';
import { writtenSide } from '../tools/writtenAdvantage';

/** Atlas' statblocks, which link and roll their own dice with what they know of the creature. */
export const STATBLOCK_SURFACES = '.atlas-statblock, .atlas-statblock-fence, .atlas-sb-markdown';

/** Where a note's text holds no rolls: links, controls, code, what is being edited, statblocks, Atlas' release notes. */
const SKIPPED = `a, button, input, textarea, select, pre, code, svg, [contenteditable], .atlas-changelog-markdown, ${STATBLOCK_SURFACES}`;

/** The inline syntax of Obsidian's Dice Roller plugin, which Fantasy Statblocks writes too: `dice: 2d6+3`. */
const DICE_PREFIX = /^[ \t]*dice:[ \t]?/i;

/**
 * What a piece of inline code rolls: the whole formula after `dice:`, or code that is nothing but
 * dice (`2d6+3`); null where it is no such roll, so code that only holds a formula among other text
 * (`version 2d6`) stays code.
 */
export function codeRoll(text: string): string | null {
  const prefix = DICE_PREFIX.exec(text);
  const expression = prefix ? text.slice(prefix[0].length) : text;
  // A side written last (`dice: 1d20+5 adv`) is read when the link rolls.
  if (!parseFormula(writtenSide(expression).formula).ok) return null;
  const formula = expression.replace(/^[ \t]+|[ \t]+$/g, '');
  return prefix || /^\d+d\d+/i.test(formula) ? formula : null;
}

/**
 * Links the rolls in a note's rendered text, as statblock text links them (`tools/textRolls.ts`), and
 * inline code holding a whole formula. Whether anything was linked.
 */
export function linkNoteDice(root: HTMLElement): boolean {
  if (root.closest(SKIPPED)) return false;
  let linked = false;
  for (const code of root.querySelectorAll<HTMLElement>('code')) {
    if (code.querySelector('.atlas-dice-link') || code.parentElement?.closest(SKIPPED)) continue;
    const formula = codeRoll(code.textContent ?? '');
    if (formula === null) continue;
    code.replaceChildren(createDiceLink(formula, formula));
    linked = true;
  }
  return linkDiceIn(root, SKIPPED) || linked;
}
