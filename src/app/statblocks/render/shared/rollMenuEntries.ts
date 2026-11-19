import { Platform } from 'obsidian';
import type { RollChoice } from '../../../services/statblockDiceLinks';
import type { ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import { t } from '../../../i18n';

/** The keys a menu row names for its roll. */
function keyHint(choice: RollChoice): string | undefined {
  if (choice.side === 'advantage') return t('dice.shiftClick');
  if (choice.side === 'disadvantage') return Platform.isMacOS ? t('dice.optionClick') : t('dice.altClick');
  return undefined;
}

const SIDE_ICONS = { advantage: 'chevrons-up', disadvantage: 'chevrons-down' } as const;

/** A roll link's menu as rows of Atlas' context menu: the statblock's and a note's alike. */
export function rollMenuEntries(choices: readonly RollChoice[]): ContextMenuEntry[] {
  return choices.map((choice): ContextMenuEntry => {
    const hint = keyHint(choice);
    return { type: 'item', label: choice.label, icon: choice.side ? SIDE_ICONS[choice.side] : 'dices', onClick: choice.roll, ...(hint && { detail: hint }) };
  });
}
