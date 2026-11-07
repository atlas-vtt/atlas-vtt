import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { DropdownToggleRow } from '../../../packages/components/primitives/DropdownToggleRow';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import type { AdvantageSide } from '../../../types/diceSetTypes';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { DieFace } from './DieFace';
import { t } from '../../../i18n';
import {
  MAX_DICE, MAX_MODIFIER, MAX_PER_DIE, TRAY_DICE,
  addDie, clampModifier, removeDie, trayDiceCount, trayFormula, type TrayPool,
} from './diceTrayPool';

/** The GM's switch for whether players see their rolls (`useShareRolls`). */
export interface ShareRolls {
  shown: boolean;
  onToggle: () => void;
}

/** What advantage the collection's dice set offers the tray. */
export interface TrayAdvantage {
  /** The sides the set has a rule for. */
  sides: readonly AdvantageSide[];
  /** Whether a roll of `formula` holds the set's dice, which advantage changes. */
  applies: (formula: string) => boolean;
}

type AdvantageChoice = AdvantageSide | 'normal';

interface DiceTrayProps {
  /** The finished formula goes up to whoever rolls it, with the side of advantage chosen for it. */
  onRoll: (formula: string, advantage: AdvantageSide | null) => boolean | void;
  /** The GM's switch for whether players see their rolls; left out where nobody else watches. */
  shareRolls?: ShareRolls;
  /** Left out where the set has no rule for either side. */
  advantage?: TrayAdvantage | undefined;
}

const SIDE_LABEL: Record<AdvantageChoice, () => string> = {
  normal: () => t('dice.normal'),
  advantage: () => t('dice.advantage'),
  disadvantage: () => t('dice.disadvantage'),
};

/**
 * Seven bodies to click, a modifier and a throw. Every die is a surface: one
 * click puts one in the tray, two put two. The "−" under a die is always there
 * once it holds any: a control that appears only under the pointer is no
 * control on a touchpad. Mixed dice are thrown together, `2d6 + 1d20 + 3`, as
 * three kinds held in one hand.
 */
export function DiceTray({ onRoll, shareRolls, advantage }: DiceTrayProps): React.ReactElement {
  const [pool, setPool] = useState<TrayPool>({});
  const [modifier, setModifier] = useState(0);
  const [side, setSide] = useState<AdvantageChoice>('normal');

  const formula = trayFormula(pool, modifier);
  const empty = formula === '' && modifier === 0;
  const total = trayDiceCount(pool);
  // Advantage changes a roll of the set's dice only: for other dice it stands, shown off.
  const helps = advantage !== undefined && formula !== '' && advantage.applies(formula);
  const rollSide = helps && side !== 'normal' ? side : null;

  const clear = (): void => {
    setPool({});
    setModifier(0);
    setSide('normal');
  };

  // After the throw the tray lies empty again, the modifier and advantage too: one
  // left standing is the mistake nobody sees, carried into the next roll.
  const throwDice = (): void => {
    if (formula === '') return;
    if (onRoll(formula, rollSide) === false) return;
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

      {advantage && (
        <SegmentedControl<AdvantageChoice>
          className="atlas-segmented--fit atlas-dice-tray__advantage"
          ariaLabel={t('dice.trayAdvantage')}
          value={side}
          disabled={!helps}
          options={(['normal', ...advantage.sides] as const).map((value) => ({ value, label: SIDE_LABEL[value]() }))}
          onChange={setSide}
        />
      )}

      {shareRolls && (
        <DropdownToggleRow label={t('dice.showRollsToPlayers')} value={shareRolls.shown} onChange={shareRolls.onToggle} />
      )}

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
        {formula === '' ? t('diceRoll.trayEmpty') : rollSide ? `${formula} · ${SIDE_LABEL[rollSide]()}` : formula}
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
