import React, { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { DropdownToggleRow } from '../../../packages/components/primitives/DropdownToggleRow';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { DieFace } from './DieFace';
import { t } from '../../../i18n';
import {
  MAX_DICE, MAX_MODIFIER, MAX_PER_DIE, TRAY_DICE,
  clampModifier, trayDiceCount, trayFormula,
} from './diceTrayPool';
import { addPick, poolOfPicks, removePick, taggedGroups, trayTags, type TrayPick } from './trayPicks';
import { DiceColourPicker } from './DiceColourPicker';
import type { DieTag } from '../../../tools/diceTags';

/** The GM's switch for whether players see their rolls (`useShareRolls`). */
export interface ShareRolls {
  shown: boolean;
  onToggle: () => void;
}

interface DiceTrayProps {
  /** The finished formula, with each die's tag, goes up to whoever rolls it. False: it was not rolled, so the tray keeps its dice. */
  onRoll: (formula: string, tags: Array<DieTag | null>) => boolean;
  /** Colours dice can be added in (`dice.registerColours`); none shows no picker. */
  colours?: readonly DieTag[];
  /** The GM's switch for whether players see their rolls; left out where nobody else watches. */
  shareRolls?: ShareRolls;
}

/**
 * Seven bodies to click, a modifier and a throw. Every die is a surface: one
 * click puts one in the tray, two put two. The "−" under a die is always there
 * once it holds any: a control that appears only under the pointer is no
 * control on a touchpad. Mixed dice are thrown together, `2d6 + 1d20 + 3`, as
 * three kinds held in one hand.
 */
export function DiceTray({ onRoll, colours = [], shareRolls }: DiceTrayProps): React.ReactElement {
  const [picks, setPicks] = useState<readonly TrayPick[]>([]);
  const pool = useMemo(() => poolOfPicks(picks), [picks]);
  const [colour, setColour] = useState<DieTag | null>(null);
  // A colour no provider offers any more is not added in.
  const chosen = colour && colours.some((tag) => tag.color === colour.color && tag.colorName === colour.colorName) ? colour : null;
  const [modifier, setModifier] = useState(0);

  const formula = trayFormula(pool, modifier);

  const empty = formula === '' && modifier === 0;
  const total = trayDiceCount(pool);
  const groups = taggedGroups(picks);

  const clear = (): void => {
    setPicks([]);
    setModifier(0);
  };

  // After the throw the tray lies empty again, the modifier too: a modifier
  // left standing is the mistake nobody sees, carried into the next roll.
  const throwDice = (): void => {
    if (formula === '') return;
    if (onRoll(formula, trayTags(picks))) clear();
  };

  return (
    <div className="atlas-dice-tray__content">
      {colours.length > 0 && <DiceColourPicker colours={colours} value={chosen} onChange={setColour} />}
      <div className="atlas-dice-tray__dice">
        {TRAY_DICE.map((sides) => {
          const count = pool[sides] ?? 0;
          return (
            <div key={sides} className="atlas-dice-tray__die">
              <LabelTooltip label={`d${sides}`}>
                <button
                  type="button"
                  className="atlas-dice-tray__face"
                  onClick={() => setPicks((prev) => addPick(prev, sides, chosen))}
                  disabled={count >= MAX_PER_DIE || total >= MAX_DICE}
                  aria-label={count === 0 ? `Add a d${sides}` : `Add a d${sides}, ${count} in the tray`}
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
                  onClick={() => setPicks((prev) => removePick(prev, sides))}
                  aria-label={`Take one d${sides} back`}
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
        <span className="atlas-dice-tray__modifier-label">Modifier</span>
        <button
          type="button"
          className="atlas-dice-tray__grip atlas-dice-tray__step"
          onClick={() => setModifier((prev) => clampModifier(prev - 1))}
          disabled={modifier <= -MAX_MODIFIER}
          aria-label="Decrease modifier"
        >
          <Minus aria-hidden="true" />
        </button>
        <span className="atlas-dice-tray__modifier-value">{modifier > 0 ? `+${modifier}` : modifier}</span>
        <button
          type="button"
          className="atlas-dice-tray__grip atlas-dice-tray__step"
          onClick={() => setModifier((prev) => clampModifier(prev + 1))}
          disabled={modifier >= MAX_MODIFIER}
          aria-label="Increase modifier"
        >
          <Plus aria-hidden="true" />
        </button>
      </div>

      {/* Always present, even empty: a region that appears with its content goes unheard by screen readers. */}
      <p className={cn('atlas-dice-tray__formula', formula === '' && 'atlas-dice-tray__formula--empty')} role="status" aria-live="polite">
        {formula === '' ? 'The tray is empty.' : formula}
      </p>
      {groups.length > 0 && (
        <ul className="atlas-dice-tray__tagged">
          {groups.map(({ tag, dice }) => (
            <li key={`${tag.color}|${tag.colorName}`} className="atlas-dice-tray__tagged-group">
              <span className="atlas-dice-tray__tag-dot" aria-hidden="true" style={{ '--atlas-die-tag-colour': tag.color } as React.CSSProperties} />
              {t('dice.colour.group', { name: tag.colorName, dice })}
            </li>
          ))}
        </ul>
      )}

      {shareRolls && (
        <DropdownToggleRow label={t('dice.showRollsToPlayers')} value={shareRolls.shown} onChange={shareRolls.onToggle} />
      )}

      <div className="atlas-dice-tray__actions">
        <Button size="sm" className="atlas-dice-tray__roll" onClick={throwDice} disabled={formula === ''}>
          Roll
        </Button>
        {!empty && (
          <Button size="sm" variant="outline" onClick={clear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
