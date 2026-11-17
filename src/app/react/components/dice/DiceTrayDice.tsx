import React from 'react';
import { LabelTooltip, TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { DieFace } from './DieFace';
import { MAX_DICE, MAX_PER_DIE, TRAY_DICE, TRAY_TOOLTIP_GAP, trayDiceCount, type TrayDie, type TrayPool } from './diceTrayPool';
import { t } from '../../../i18n';

interface DiceTrayDiceProps {
  counts: TrayPool;
  onAdd: (sides: TrayDie) => void;
  onTakeBack: (sides: TrayDie) => void;
  /** Rolls one die of `sides` at once, with the tray's modifier and side of advantage. */
  onRollNow: (sides: TrayDie) => void;
}

/** Why a click puts no more dice of `sides` in the tray; null while it does. */
function limitOf(sides: TrayDie, counts: TrayPool): string | null {
  if ((counts[sides] ?? 0) >= MAX_PER_DIE) return t('diceRoll.dieLimit', { sides, max: MAX_PER_DIE });
  if (trayDiceCount(counts) >= MAX_DICE) return t('diceRoll.diceLimit', { max: MAX_DICE });
  return null;
}

/**
 * Seven bodies to click, each named under it. A click (or its number key, its place in the row) puts one
 * in the tray, Shift-click rolls it at once, right-click (or Alt-click, or Delete) takes one back. A die at
 * its limit stays focusable and says why in its tooltip, and still gives dice back.
 */
export function DiceTrayDice({ counts, onAdd, onTakeBack, onRollNow }: DiceTrayDiceProps): React.ReactElement {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={600}>
      <div className="atlas-dice-tray__dice">
        {TRAY_DICE.map((sides, place) => {
          const count = counts[sides] ?? 0;
          const limit = limitOf(sides, counts);
          const onClick = (event: React.MouseEvent): void => {
            if (event.altKey) onTakeBack(sides);
            else if (event.shiftKey) onRollNow(sides);
            else if (!limit) onAdd(sides);
          };
          const onKeyDown = (event: React.KeyboardEvent): void => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.preventDefault();
            onTakeBack(sides);
          };
          return (
            <div key={sides} className="atlas-dice-tray__die">
              <LabelTooltip sideOffset={TRAY_TOOLTIP_GAP} label={`d${sides}`} hint={limit ?? t('diceRoll.dieHint')} shortcut={String(place + 1)} describe>
                <button
                  type="button"
                  className="atlas-dice-tray__face"
                  aria-disabled={limit ? true : undefined}
                  aria-label={count === 0 ? t('diceRoll.die', { sides }) : t('diceRoll.dieHeld', { sides, held: count })}
                  onClick={onClick}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onTakeBack(sides);
                  }}
                  onKeyDown={onKeyDown}
                >
                  <DieFace sides={sides} />
                  {/* One badge for as long as the die is held: its pop plays once, a quick second click never restarts it. */}
                  {count > 0 && <span className="atlas-dice-tray__count" aria-hidden="true">{count}</span>}
                </button>
              </LabelTooltip>
              <span className="atlas-dice-tray__caption" aria-hidden="true">{t('diceRoll.die', { sides })}</span>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
