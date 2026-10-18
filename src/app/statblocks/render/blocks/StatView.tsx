import React from 'react';
import { diceLinkProps } from '../../../services/statblockDiceLinks';
import { splitDiceSegments } from '../../../services/statblockDiceText';
import type { StatBlock } from '../../model/templateTypes';
import { isDiceNotation } from '../../values/diceNotation';
import type { BlockDisplay } from '../blockDisplay';
import { bonusId } from '../../rollBonuses/armableValues';
import { BONUS_ID_ATTRIBUTE } from '../../rollBonuses/armedBonuses';
import { useArmable } from '../../rollBonuses/rollBonusContext';
import { ArmSwitch } from '../shared/ArmSwitch';
import { BonusLink } from '../shared/BonusLink';
import { namesHitPoints } from '../shared/hitPoints';
import { useSheet } from '../sheetContext';
import type { SheetState } from '../sheetState';
import { LabelledLine } from '../values/LabelledLine';
import { shownField } from '../values/shownText';
import { DisplayText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/**
 * The dice its `rollFrom` field holds, where the value itself shows none to
 * click ("45" for hit points rolled from "7d10 + 7"); otherwise null.
 */
function rollFromDice(block: StatBlock, sheet: SheetState, display: BlockDisplay): string | null {
  if (!block.rollFrom || display.state !== 'value') return null;
  const dice = shownField(block.rollFrom, sheet).text.trim();
  if (!isDiceNotation(dice)) return null;
  const shown = display.text?.text ?? '';
  return splitDiceSegments(shown).some((segment) => segment.dice) ? null : dice;
}

/** A labelled value: "**Armor Class** 14" run in, or the label over the value in a stat strip. */
export function StatView({ block, display }: BlockViewProps<StatBlock>): React.JSX.Element {
  const { state } = useSheet();
  const field = state.fields.get(block.field);
  const label = block.label ?? field?.label ?? block.field;
  const hitPoints = field?.meaning === 'hit-points' || namesHitPoints(block.field, label);
  const dice = rollFromDice(block, state, display);
  const value = <DisplayText display={display} />;
  const shown = display.state === 'value' ? display.text?.text ?? '' : '';
  const slot = (
    <ValueSlot block={block}>
      {dice ? <span {...diceLinkProps(dice)}>{value}</span> : <BonusLink text={shown} rollable={block.rollable}>{value}</BonusLink>}
    </ValueSlot>
  );
  const id = bonusId(block.field);
  const armable = useArmable(id, block.addsToRolls);

  return (
    <LabelledLine label={label} look={block.look} className="atlas-sb-stat" hitPoints={hitPoints} placeholder={state.provisional !== undefined}>
      {armable ? (
        <span className="atlas-sb-arm-line" {...{ [BONUS_ID_ATTRIBUTE]: id }}>
          {slot}
          <ArmSwitch id={id} label={armable.label} />
        </span>
      ) : slot}
    </LabelledLine>
  );
}
