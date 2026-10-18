import React from 'react';
import type { PairsBlock } from '../../model/templateTypes';
import { bonusId, type ArmableValues } from '../../rollBonuses/armableValues';
import { BONUS_ID_ATTRIBUTE } from '../../rollBonuses/armedBonuses';
import { useRollBonusTarget } from '../../rollBonuses/rollBonusContext';
import { normalisePairs, pairText, type Pair } from '../../values/pairValues';
import { valueText } from '../../values/valueText';
import { ArmSwitch } from '../shared/ArmSwitch';
import { BonusLink } from '../shared/BonusLink';
import { InlineText } from '../shared/InlineText';
import { useSheet } from '../sheetContext';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

interface PairListProps {
  block: PairsBlock;
  pairs: readonly Pair[];
  signed: boolean;
  /** The values that add to rolls, where the block does ("Add to next roll"). */
  armable: ArmableValues | undefined;
}

/**
 * The pairs one by one, each named after its pair ("Agility 2"): its number a roll of that bonus where the block
 * rolls as a bonus, and followed by the switch that arms it for the next roll where the block adds to rolls (a
 * Daggerheart Experience, a skill).
 */
function PairList({ block, pairs, signed, armable }: PairListProps): React.JSX.Element {
  const { app, sourcePath } = useSheet();
  return (
    <span className="atlas-sb-value">
      {pairs.map((pair, index) => {
        const name = pairText({ key: pair.key, value: '' }, false);
        const value = pairText({ key: '', value: pair.value }, signed);
        const id = bonusId(block.field, pair.key);
        const arm = armable?.get(id);
        return (
          <React.Fragment key={index}>
            {index > 0 && ', '}
            <span data-roll-name={name || undefined} {...(arm && { className: 'atlas-sb-arm-line', [BONUS_ID_ATTRIBUTE]: id })}>
              {name && <InlineText text={name} app={app} sourcePath={sourcePath} dice={false} />}
              {name && value && ' '}
              {value && <BonusLink text={value} rollable={block.rollable}><InlineText text={value} app={app} sourcePath={sourcePath} dice /></BonusLink>}
              {arm && <ArmSwitch id={id} label={arm.label} />}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}

/** "**Saving Throws** Dex +5, Con +3". */
export function PairsView({ block, display }: BlockViewProps<PairsBlock>): React.JSX.Element {
  const { state } = useSheet();
  const label = block.label ?? state.fields.get(block.field)?.label ?? block.field;
  const signed = block.display === 'signed';
  const value = display.state === 'value' ? state.reader(block.field) : undefined;
  const pairs = normalisePairs(value);
  // A value that holds no pairs shows as it is written.
  const text = pairs.length ? pairs.map((pair) => pairText(pair, signed)).join(', ') : valueText(value);
  const target = useRollBonusTarget();
  const armable = block.addsToRolls ? target?.armable : undefined;
  const arms = armable !== undefined && pairs.some((pair) => armable.has(bonusId(block.field, pair.key)));
  const shown = (block.rollable && pairs.length > 0) || arms
    ? <PairList block={block} pairs={pairs} signed={signed} armable={armable} />
    : <ValueText shown={{ text, problems: [] }} />;

  return (
    <LabelledLine label={label} className="atlas-sb-pairs">
      <ValueSlot block={block}>{display.state === 'value' ? shown : <StandIn display={display} />}</ValueSlot>
    </LabelledLine>
  );
}
