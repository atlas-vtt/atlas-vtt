import React, { useContext } from 'react';
import { cn } from '../../../../utils/cn';
import { valuePrompt } from '../blockDisplay';
import { bonusId } from '../../rollBonuses/armableValues';
import { BONUS_ID_ATTRIBUTE } from '../../rollBonuses/armedBonuses';
import { useArmable } from '../../rollBonuses/rollBonusContext';
import { ArmSwitch } from '../shared/ArmSwitch';
import { BonusLink } from '../shared/BonusLink';
import { hitPointsAttribute, namesHitPoints } from '../shared/hitPoints';
import { useSheet } from '../sheetContext';
import type { SheetState } from '../sheetState';
import { metricNumberText } from '../values/blockText';
import { hasText } from '../values/shownText';
import { FieldPrompt, StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { FieldKey, MetricBlock } from '../../model/templateTypes';
import type { BlockViewProps } from './blockViewProps';

/** Marks one number of a Metric with its place among the block's numbers; the editors find the number clicked by it. */
export const METRIC_INDEX_ATTRIBUTE = 'data-metric-index';

/** What a number not named yet is called on the card. */
export const UNNAMED_NUMBER = 'Number';

/** What the group's name reads while editing, before it has one: where to double-click to name it. */
export const UNNAMED_GROUP = 'Group name';

/** What an empty number shows where a statblock is read: a dash, so the box keeps its columns. */
const BLANK = '–';

export interface MetricNumber {
  key: FieldKey;
  /** Its place among the block's numbers, unnamed ones included. */
  index: number;
}

/** The numbers a Metric shows: every one while editing, the named ones where a statblock is read. */
export function shownMetricNumbers(block: MetricBlock, sheet: Pick<SheetState, 'mode'>): MetricNumber[] {
  const numbers = block.fields.map((key, index) => ({ key, index }));
  return sheet.mode === 'editing' ? numbers : numbers.filter((number) => number.key !== '');
}

/** One number: its name small over its value, or what stands in for an empty one. */
function MetricCell({ block, number }: { block: MetricBlock; number: MetricNumber }): React.JSX.Element {
  const { state } = useSheet();
  const { key, index } = number;
  const field = key ? state.fields.get(key) : undefined;
  const label = key ? (field?.label ?? key) : UNNAMED_NUMBER;
  const shown = metricNumberText(key, state);
  const id = bonusId(key);
  const armable = useArmable(id, block.addsToRolls);
  const editing = state.mode === 'editing';
  // In the template editor a number not named yet shows the prompt it will have, worded after its placeholder name.
  const unnamedPrompt = useContext(ValueEditingContext)?.drawsUnnamed ? valuePrompt({ label }, label) : BLANK;
  const value = hasText(shown) || shown.problems.length > 0
    ? <BonusLink text={shown.text} rollable={block.rollable}><ValueText shown={shown} /></BonusLink>
    : editing ? <FieldPrompt prompt={key ? valuePrompt(field, label) : unnamedPrompt} /> : <span className="atlas-sb-value atlas-sb-metric__blank">{BLANK}</span>;

  return (
    <div
      className="atlas-sb-metric__number"
      {...{ [METRIC_INDEX_ATTRIBUTE]: index }}
      data-prop={key || undefined}
      data-roll-name={block.rollable && key ? label : undefined}
      {...(armable && { [BONUS_ID_ATTRIBUTE]: id })}
      {...hitPointsAttribute(Boolean(key) && (field?.meaning === 'hit-points' || namesHitPoints(key, label)))}
    >
      <span className={cn('atlas-sb-label', !key && 'atlas-sb-prompt')}>{label}</span>
      <span className="atlas-sb-metric__value">
        {key ? <ValueSlot block={block} field={key}>{value}</ValueSlot> : value}
        {armable && <ArmSwitch id={id} label={armable.label} />}
      </span>
    </div>
  );
}

/**
 * A stat block's key numbers in one box: the group's name over them where it
 * has two or more, then each number's name small over its value, a thin rule
 * between two ("Major 8 | Severe 15"). Each number is a field of its own and
 * is filled in on its own.
 */
export function MetricView({ block, display }: BlockViewProps<MetricBlock>): React.JSX.Element {
  const { state } = useSheet();
  const numbers = shownMetricNumbers(block, state);
  const grouped = numbers.length > 1;
  const heading = grouped ? block.heading?.trim() : undefined;
  const unnamedGroup = grouped && !heading && state.mode === 'editing';

  return (
    <div className="atlas-sb-metric">
      {heading && <div className="atlas-sb-metric__heading">{heading}</div>}
      {unnamedGroup && <div className="atlas-sb-metric__heading atlas-sb-prompt">{UNNAMED_GROUP}</div>}
      {display.state === 'fallback'
        ? <div className="atlas-sb-metric__value"><StandIn display={display} /></div>
        : (
          <div className="atlas-sb-metric__numbers">
            {numbers.map((number) => <MetricCell key={number.index} block={block} number={number} />)}
          </div>
        )}
    </div>
  );
}
