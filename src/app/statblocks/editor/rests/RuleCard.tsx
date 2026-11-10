import React, { useEffect, useRef } from 'react';
import { ArrowLeftRight, BatteryFull, ChevronsDown, Equal, Eraser, Plus, Trash2 } from 'lucide-react';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../../i18n';
import { withRows } from '../../../recovery/editor/recoveryEdits';
import type { RecoveryButton, RecoveryRule, RecoveryRuleKind, ResourceOrCounters } from '../../../recovery/recoveryTypes';
import { FormulaInput, RowsChips, WholeInput, type FieldChoice } from './RuleInputs';
import { SetToInput } from './SetToInput';

export interface RuleCardProps {
  rule: RecoveryRule | undefined;
  /** The metric's name and colour, and the name of the button or action the rule belongs to. */
  metric: string;
  color: string | undefined;
  owner: string;
  /** The template's buttons, which a counters rule picks rows by. */
  buttons: readonly RecoveryButton[];
  fields: readonly FieldChoice[];
  nameOf: (target: ResourceOrCounters) => string;
  /** Whether the card holds another metric a Spend rule could spend. */
  canSpend: boolean;
  /** Its chosen kind takes focus: opened from the keyboard. */
  focusKind: boolean;
  onKind: (kind: RecoveryRuleKind) => void;
  onChange: (rule: RecoveryRule) => void;
  onPickSource: () => void;
  onRemove: () => void;
}

interface KindChoice {
  kind: RecoveryRuleKind;
  label: MessageKey;
  icon: React.ReactNode;
}

/** The kinds a resource or a row of counters takes, in the card's order: back up, then what spends. */
const AMOUNT_KINDS: readonly KindChoice[] = [
  { kind: 'full', label: 'recoveryEditor.kind.full', icon: <BatteryFull /> },
  { kind: 'amount', label: 'recoveryEditor.kind.amount', icon: <Plus /> },
  { kind: 'share', label: 'recoveryEditor.kind.share', icon: <span className="atlas-rc-card__glyph">{'½'}</span> },
  { kind: 'set', label: 'recoveryEditor.kind.set', icon: <Equal /> },
  { kind: 'spend', label: 'recoveryEditor.kind.spend', icon: <ArrowLeftRight /> },
];

/** The kinds a condition takes. */
const CONDITION_KINDS: readonly KindChoice[] = [
  { kind: 'step', label: 'recoveryEditor.kind.step', icon: <ChevronsDown /> },
  { kind: 'clear', label: 'recoveryEditor.kind.clear', icon: <Eraser /> },
];

/** What a rule asks for beyond its kind: formulas and numbers, a share, what it spends. */
function RuleFields({ rule, fields, nameOf, onChange, onPickSource }: Pick<RuleCardProps, 'fields' | 'nameOf' | 'onChange' | 'onPickSource'> & { rule: RecoveryRule }): React.ReactElement | null {
  switch (rule.does) {
    case 'amount':
      return (
        <>
          <FormulaInput label={t('recoveryEditor.card.formula')} value={rule.formula} fields={fields}
            onChange={(formula) => onChange({ ...rule, formula })} />
          <WholeInput label={t('recoveryEditor.card.atLeast')} value={rule.min} least={0} optional inline
            onChange={(min) => onChange(min === undefined ? { target: rule.target, does: 'amount', formula: rule.formula } : { ...rule, min })} />
        </>
      );
    case 'share':
      return (
        <>
          <div className="atlas-rc-card__field atlas-rc-card__field--wide">
            <span className="atlas-rc-card__label">{t('recoveryEditor.card.share')}</span>
            <SegmentedControl ariaLabel={t('recoveryEditor.card.share')} value={rule.share === 0.5 ? 'half' : 'quarter'}
              options={[{ value: 'half', label: `½ ${t('recoveryEditor.card.half')}` }, { value: 'quarter', label: `¼ ${t('recoveryEditor.card.quarter')}` }]}
              onChange={(share) => onChange({ ...rule, share: share === 'half' ? 0.5 : 0.25 })} />
          </div>
          <div className="atlas-rc-card__field">
            <span className="atlas-rc-card__label">{t('recoveryEditor.card.round')}</span>
            <SegmentedControl ariaLabel={t('recoveryEditor.card.round')} value={rule.round}
              options={[{ value: 'down', label: t('recoveryEditor.card.down') }, { value: 'up', label: t('recoveryEditor.card.up') }]}
              onChange={(round) => onChange({ ...rule, round })} />
          </div>
          <WholeInput label={t('recoveryEditor.card.atLeast')} value={rule.min} least={0} optional
            onChange={(min) => onChange(min === undefined ? { target: rule.target, does: 'share', share: rule.share, round: rule.round } : { ...rule, min })} />
        </>
      );
    case 'set':
      return <SetToInput value={rule.to} fields={fields} onChange={(to) => onChange({ ...rule, to })} />;
    case 'spend':
      return (
        <>
          <div className="atlas-rc-card__field atlas-rc-card__field--wide">
            <span className="atlas-rc-card__label">{t('recoveryEditor.card.spends')}</span>
            <div className="atlas-rc-card__source">
              <span className="atlas-rc-card__source-name">{nameOf(rule.from)}</span>
              <button type="button" className="atlas-rc-card__change" onClick={onPickSource}>{t('recoveryEditor.card.changeSource')}</button>
            </div>
          </div>
          <FormulaInput label={t('recoveryEditor.card.each')} value={rule.each} fields={fields}
            onChange={(each) => onChange({ ...rule, each })} />
          <WholeInput label={t('recoveryEditor.card.most')} value={rule.most} least={1} optional inline
            onChange={(most) => onChange(most === undefined ? { target: rule.target, does: 'spend', from: rule.from, each: rule.each } : { ...rule, most })} />
        </>
      );
    case 'step':
      return <WholeInput label={t('recoveryEditor.card.lowerBy')} value={Math.abs(rule.by)} least={1} inline
        onChange={(by) => { if (by !== undefined) onChange({ ...rule, by: -by }); }} />;
    default:
      return null;
  }
}

/**
 * The card under a picked metric: its name and its button's (or action's), Remove, the kinds of rule its type
 * takes as one segmented row (the rule's own chosen), and what the chosen kind asks for. A
 * counters rule also says which rows it gives back.
 */
export function RuleCard(props: RuleCardProps): React.ReactElement | null {
  const { rule, metric, color, owner, buttons, canSpend, focusKind, onKind, onChange, onRemove } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusKind) ref.current?.querySelector<HTMLElement>('.atlas-rc-card__kinds [aria-checked="true"]')?.focus({ preventScroll: true });
  }, [focusKind]);
  if (!rule) return null;

  const kinds = rule.target.kind === 'condition' ? CONDITION_KINDS : AMOUNT_KINDS;
  const options: SegmentedOption<RecoveryRuleKind>[] = kinds.map(({ kind, label, icon }) => {
    const refused = kind === 'spend' && !canSpend;
    return { value: kind, label: t(label), icon, ...(refused && { disabled: true, hint: t('recoveryEditor.kindNoSource') }) };
  });
  const hasFields = rule.target.kind === 'counters' || (rule.does !== 'full' && rule.does !== 'clear');

  return (
    <div ref={ref} className="atlas-rc-card__body" role="group" aria-label={t('recoveryEditor.metricRule', { metric, rule: owner })}>
      <div className="atlas-rc-card__head">
        <span className="atlas-rc-card__dot" style={color ? { backgroundColor: color } : undefined} aria-hidden="true" />
        <span className="atlas-rc-card__metric">{metric}</span>
        <span className="atlas-rc-card__button">{owner}</span>
        <LabelTooltip label={t('recoveryEditor.kind.remove', { button: owner })}>
          <button type="button" className="atlas-rc-card__remove" onClick={onRemove}><Trash2 /></button>
        </LabelTooltip>
      </div>
      <SegmentedControl className="atlas-segmented--fit atlas-rc-card__kinds" ariaLabel={t('recoveryEditor.card.kind')} value={rule.does}
        options={options} roving onChange={onKind} />
      {hasFields && (
        <div className="atlas-rc-card__fields">
          <RuleFields key={rule.does} {...props} rule={rule} />
          {rule.target.kind === 'counters' && (
            <RowsChips rows={rule.target.rows} buttons={buttons} onChange={(rows) => onChange(withRows(rule, rows))} />
          )}
        </div>
      )}
    </div>
  );
}
