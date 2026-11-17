import React from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DiceRollResult } from '../../../types/diceTypes';
import { MINUS, TRAY_SURFACE, TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { sideLabel } from './diceTrayStatus';
import { t } from '../../../i18n';

/** A logged roll's formula as the tray writes it: a true minus sign between terms. */
export function historyFormula(entry: DiceRollResult): string {
  return entry.formula.replace(/ - /g, ` ${MINUS} `);
}

/** A logged roll as the tray names it: its formula, and its side of advantage in the result's own words. */
export function historyTitle(entry: DiceRollResult): string {
  const formula = historyFormula(entry);
  return entry.advantage ? t('diceRoll.titleWithSide', { title: formula, side: sideLabel(entry.advantage) }) : formula;
}

interface DiceTrayHistoryToggleProps {
  count: number;
  open: boolean;
  onToggle: () => void;
  listId: string;
}

/** "Roll history", the number of rolls and a chevron: a quiet row that opens and closes the list below. */
export function DiceTrayHistoryToggle({ count, open, onToggle, listId }: DiceTrayHistoryToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      className="atlas-dice-tray__history-toggle"
      aria-expanded={open}
      aria-controls={listId}
      onClick={onToggle}
    >
      <span className="atlas-dice-tray__history-title">{t('diceRoll.historyTitle')}</span>
      <span className="atlas-dice-tray__history-count" aria-label={t('diceRoll.historyCount', { count })}>{count}</span>
      <ChevronDown aria-hidden="true" className="atlas-dice-tray__history-chevron" />
    </button>
  );
}

interface DiceTrayHistoryListProps {
  history: readonly DiceRollResult[];
  listId: string;
  /** Open, the list unfolds under its toggle; closed, it folds away and takes no keys or pointer. */
  open: boolean;
  /** Rolls a logged roll again, as it was rolled. */
  onRepeat: (entry: DiceRollResult) => void;
  /** The tray is empty, so Enter rolls the newest again: its button names the key. */
  enterRepeatsNewest: boolean;
}

/**
 * The rolls of the dice log, newest first, each with its total: a click on the row (or its button, which
 * keyboard and screen reader reach) rolls it again. About four rows high; more scroll. It stays mounted, so it
 * can unfold and fold away (`dice-dropdown.scss`); closed, it is inert.
 */
export function DiceTrayHistoryList({ history, listId, open, onRepeat, enterRepeatsNewest }: DiceTrayHistoryListProps): React.ReactElement {
  return (
    <div className="atlas-dice-tray__history-reveal" data-open={open || undefined} inert={!open} aria-hidden={!open || undefined}>
      <ul id={listId} className="atlas-dice-tray__history" aria-label={t('diceRoll.historyTitle')}>
        {history.length === 0 && <li className="atlas-dice-tray__history-empty">{t('diceRoll.historyEmpty')}</li>}
        {history.map((entry, index) => {
          const title = historyTitle(entry);
          return (
            // The row is the pointer's way in; its button is the keyboard's and the screen reader's.
            <li key={entry.id} className="atlas-dice-tray__history-row" onClick={() => onRepeat(entry)}>
              <span className="atlas-dice-tray__history-formula">{title}</span>
              <span className="atlas-dice-tray__history-total">{entry.total}</span>
              <LabelTooltip
                label={t('diceRoll.rollAgain', { formula: title })}
                {...(index === 0 && enterRepeatsNewest && { shortcut: 'Enter' })}
                outside={TRAY_SURFACE}
                side="right"
                sideOffset={TRAY_TOOLTIP_GAP}
              >
                <button
                  type="button"
                  className="atlas-dice-tray__history-again"
                  aria-label={t('diceRoll.rollAgain', { formula: title })}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRepeat(entry);
                  }}
                >
                  <RotateCw aria-hidden="true" />
                </button>
              </LabelTooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
