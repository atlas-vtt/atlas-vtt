import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import { DieFace } from './DieFace';
import {
  MAX_DICE, MAX_MODIFIER, MAX_PER_DIE, TRAY_DICE,
  addDie, clampModifier, removeDie, trayDiceCount, trayFormula, type TrayPool,
} from './diceTrayPool';

interface DiceTrayProps {
  /** The finished formula goes up to whoever rolls it. */
  onRoll: (formula: string) => boolean | void;
}

/**
 * Seven bodies to click, a modifier and a throw. Every die is a surface: one
 * click puts one in the tray, two put two. The "−" under a die is always there
 * once it holds any: a control that appears only under the pointer is no
 * control on a touchpad. Mixed dice are thrown together, `2d6 + 1d20 + 3`, as
 * three kinds held in one hand.
 */
export function DiceTray({ onRoll }: DiceTrayProps): React.ReactElement {
  const [pool, setPool] = useState<TrayPool>({});
  const [modifier, setModifier] = useState(0);

  const formula = trayFormula(pool, modifier);
  const empty = formula === '' && modifier === 0;
  const total = trayDiceCount(pool);

  const clear = (): void => {
    setPool({});
    setModifier(0);
  };

  // After the throw the tray lies empty again, the modifier too: a modifier
  // left standing is the mistake nobody sees, carried into the next roll.
  const throwDice = (): void => {
    if (formula === '') return;
    if (onRoll(formula) === false) return;
    clear();
  };

  return (
    <div className="atlas-dice-tray__content">
      <div className="atlas-dice-tray__dice">
        {TRAY_DICE.map((sides) => {
          const count = pool[sides] ?? 0;
          return (
            <div key={sides} className="atlas-dice-tray__die">
              <LabelTooltip label={`d${sides}`}>
                <button
                  type="button"
                  className="atlas-dice-tray__face"
                  onClick={() => setPool((prev) => addDie(prev, sides))}
                  disabled={count >= MAX_PER_DIE || total >= MAX_DICE}
                  aria-label={count === 0 ? t('diceRoll.addDie', { sides }) : t('diceRoll.addDieHeld', { sides, held: count })}
                >
                  <DieFace sides={sides} />
                  {count > 0 && <span key={count} className="atlas-dice-tray__count" aria-hidden="true">{count}</span>}
                </button>
              </LabelTooltip>
              {/* The place under the die stays even when empty: appearing with the
                  first click, it would push the dice away and the second click would miss. */}
              {count > 0 ? (
                <button
                  type="button"
                  className="atlas-dice-tray__grip"
                  onClick={() => setPool((prev) => removeDie(prev, sides))}
                  aria-label={t('diceRoll.takeBack', { sides })}
                >
                  <Minus aria-hidden="true" />
                </button>
              ) : (
                <span className="atlas-dice-tray__grip-space" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      <div className="atlas-dice-tray__modifier">
        <span className="atlas-dice-tray__modifier-label">{t('diceRoll.modifier')}</span>
        <button
          type="button"
          className="atlas-dice-tray__grip atlas-dice-tray__step"
          onClick={() => setModifier((prev) => clampModifier(prev - 1))}
          disabled={modifier <= -MAX_MODIFIER}
          aria-label={t('diceRoll.decreaseModifier')}
        >
          <Minus aria-hidden="true" />
        </button>
        <span className="atlas-dice-tray__modifier-value">{modifier > 0 ? `+${modifier}` : modifier}</span>
        <button
          type="button"
          className="atlas-dice-tray__grip atlas-dice-tray__step"
          onClick={() => setModifier((prev) => clampModifier(prev + 1))}
          disabled={modifier >= MAX_MODIFIER}
          aria-label={t('diceRoll.increaseModifier')}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>

      {/* Always present, even empty: a region that appears with its content goes unheard by screen readers. */}
      <p className={cn('atlas-dice-tray__formula', formula === '' && 'atlas-dice-tray__formula--empty')} role="status" aria-live="polite">
        {formula === '' ? t('diceRoll.trayEmpty') : formula}
      </p>

      <div className="atlas-dice-tray__actions">
        <Button size="sm" className="atlas-dice-tray__roll" onClick={throwDice} disabled={formula === ''}>
          {t('diceRoll.roll')}
        </Button>
        {!empty && (
          <Button size="sm" variant="outline" onClick={clear}>
            {t('diceRoll.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
