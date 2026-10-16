import React from 'react';
import type { PairsBlock } from '../../model/templateTypes';
import { normalisePairs, pairText, type Pair } from '../../values/pairValues';
import { valueText } from '../../values/valueText';
import { BonusLink } from '../shared/BonusLink';
import { InlineText } from '../shared/InlineText';
import { useSheet } from '../sheetContext';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/** The pairs of a rollable block one by one, each value a roll named after its pair ("Agility 2" rolls `+2` as Agility). */
function RollablePairs({ pairs, signed }: { pairs: readonly Pair[]; signed: boolean }): React.JSX.Element {
  const { app, sourcePath } = useSheet();
  return (
    <span className="atlas-sb-value">
      {pairs.map((pair, index) => {
        const name = pairText({ key: pair.key, value: '' }, false);
        const value = pairText({ key: '', value: pair.value }, signed);
        return (
          <React.Fragment key={index}>
            {index > 0 && ', '}
            <span data-roll-name={name || undefined}>
              {name && <InlineText text={name} app={app} sourcePath={sourcePath} dice={false} />}
              {name && value && ' '}
              {value && <BonusLink text={value} rollable><InlineText text={value} app={app} sourcePath={sourcePath} dice /></BonusLink>}
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
  const shown = block.rollable && pairs.length > 0 ? <RollablePairs pairs={pairs} signed={signed} /> : <ValueText shown={{ text, problems: [] }} />;

  return (
    <LabelledLine label={label} className="atlas-sb-pairs">
      <ValueSlot block={block}>{display.state === 'value' ? shown : <StandIn display={display} />}</ValueSlot>
    </LabelledLine>
  );
}
