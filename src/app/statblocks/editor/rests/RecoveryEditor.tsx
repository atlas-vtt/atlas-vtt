import React, { useMemo, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import {
  newButtonId, withAddedButton, withButtonMoved, withButtonOrder, withoutButton, withRenamedButton,
} from '../../../recovery/editor/recoveryEdits';
import { conditionMetrics, sheetMetrics } from '../../../recovery/editor/recoveryMetrics';
import { ALWAYS, resolveScope, scopeName, type RuleScope } from '../../../recovery/editor/recoveryScope';
import { MAX_RECOVERY_RULES, type RecoveryButton, type RecoveryRuleKind, type RecoveryTarget } from '../../../recovery/recoveryTypes';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { chipSpotId } from './ConditionChips';
import { RecoveryRail } from './RecoveryRail';
import { RecoveryScopes } from './RecoveryScopes';
import { RecoveryStage } from './RecoveryStage';
import { useRuleEditing } from './useRuleEditing';
import { useSpots } from './useSpots';

interface RecoveryEditorProps {
  template: StatblockTemplate;
  name: string;
  buttons: readonly RecoveryButton[];
  onButtonsChange: (buttons: readonly RecoveryButton[]) => void;
  resources: readonly ResourceDefinition[];
  conditions: readonly ConditionDefinition[];
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** Where `key` moves among `count` spots from the one at `at`; null for a key that moves nothing. */
function nextSpotIndex(key: string, at: number, count: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = STEPS[key];
  return step === undefined ? null : at + step;
}

/** The line over the card while nothing else is asked: add a button, pick one, or pick what its scope gives back. */
function idlePrompt(count: number, button: RecoveryButton | null, scope: RuleScope): string {
  if (count === 0) return t('recoveryEditor.noButtons');
  return button ? t('recoveryEditor.pickMetrics', { button: scopeName(button, scope) }) : t('recoveryEditor.pickButton');
}

/**
 * One template's recovery buttons: the rail of buttons, what the selected one does (Always and its
 * steps), and the template's card, whose metrics the selected scope's rules restore. Escape
 * cancels picking what a Spend rule spends, then closes the card (focus back on its metric), then
 * puts the picked metric down, and stops there each time: the dialog listens for Escape on the
 * document.
 */
export function RecoveryEditor({ template, name, buttons, onButtonsChange, resources, conditions }: RecoveryEditorProps): React.ReactElement {
  const metrics = useMemo(() => sheetMetrics(template, resources), [template, resources]);
  const chips = useMemo(() => conditionMetrics(conditions), [conditions]);
  const [chosen, setChosen] = useState<string | null>(buttons[0]?.id ?? null);
  // A button gone without being removed here (a preset applied) gives way to the first; none chosen stays none
  const button = buttons.find((each) => each.id === chosen) ?? (chosen === '' ? null : buttons[0] ?? null);
  const [chosenScope, setScope] = useState<RuleScope>(ALWAYS);
  // An action gone (removed, or its button another) gives way to Always
  const scope = resolveScope(button, chosenScope);
  const [notice, setNotice] = useState<string | null>(null);
  const spots = useSpots();
  const replace = (next: RecoveryButton): void => onButtonsChange(buttons.map((each) => (each.id === next.id ? next : each)));
  const editing = useRuleEditing(button, scope, replace);

  const targets = useMemo(() => new Map<string, RecoveryTarget>([
    ...metrics.metrics.map((metric): [string, RecoveryTarget] => [metric.spotId, metric.target]),
    ...chips.map((chip): [string, RecoveryTarget] => [chipSpotId(chip), chip.target]),
  ]), [metrics, chips]);
  const [activeSpot, setActive] = useState<string | null>(null);
  const active = activeSpot !== null && targets.has(activeSpot) ? activeSpot : targets.keys().next().value ?? null;

  const chooseScope = (next: RuleScope): void => {
    editing.closeAll();
    setNotice(null);
    setScope(next);
  };

  const select = (id: string): void => {
    chooseScope(ALWAYS);
    setChosen(id);
  };

  const pick = (spotId: string, fromKeyboard: boolean): void => {
    const target = targets.get(spotId);
    if (!target) return;
    setActive(spotId);
    const result = editing.pick(spotId, target, fromKeyboard);
    setNotice(result === 'full' ? t('recoveryEditor.rulesFull', { count: MAX_RECOVERY_RULES }) : null);
  };

  /** Picking what a Spend rule spends: the keys go on from the metric, to the one it spends. */
  const startSpending = (): void => {
    const picked = editing.picked;
    editing.pickSource();
    if (picked) spots.focus(picked.spotId);
  };

  const chooseKind = (kind: RecoveryRuleKind): void => {
    const picked = editing.picked;
    if (editing.chooseKind(kind) === 'spending' && picked) spots.focus(picked.spotId);
  };

  const removeRule = (): void => {
    const picked = editing.picked;
    editing.remove();
    if (picked) spots.focus(picked.spotId);
  };

  const onSpotKey = (spotId: string, event: React.KeyboardEvent): void => {
    // The spots the arrow keys walk, in order: the card's that it draws, then the chips
    const order = [...targets.keys()].filter((id) => spots.element(id) !== null);
    const at = order.indexOf(spotId);
    const next = nextSpotIndex(event.key, at, order.length);
    if (next === null || at < 0) return;
    event.preventDefault();
    const spot = order[Math.max(0, Math.min(order.length - 1, next))];
    if (!spot) return;
    setActive(spot);
    spots.focus(spot);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    // A tooltip closing on this Escape leaves it to us; an open list or another control does not
    if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
    const picked = editing.picked;
    const step = editing.escape();
    if (!step) return;
    event.stopPropagation();
    // Picking a source given up, the card comes back and its kind takes focus
    if (step !== 'spending' && picked) spots.focus(picked.spotId);
  };

  const add = (label: string): string | null => {
    const id = newButtonId(buttons);
    const next = withAddedButton(buttons, label, id);
    if (!next) return null;
    onButtonsChange(next);
    select(id);
    return id;
  };

  const remove = (id: string): void => {
    const at = buttons.findIndex((each) => each.id === id);
    const rest = withoutButton(buttons, id);
    onButtonsChange(rest);
    if (button?.id === id) select(rest[at]?.id ?? rest[at - 1]?.id ?? '');
  };

  const prompt = notice ?? (editing.spending ? t('recoveryEditor.pickSource') : idlePrompt(buttons.length, button, scope));

  return (
    <div className="atlas-rc-editor" onKeyDown={onKeyDown}>
      <RecoveryRail
        buttons={buttons}
        selected={button?.id ?? null}
        onSelect={select}
        onAdd={add}
        onRename={(id, label) => onButtonsChange(withRenamedButton(buttons, id, label))}
        onReorder={(ids) => onButtonsChange(withButtonOrder(buttons, ids))}
        onMove={(id, step) => onButtonsChange(withButtonMoved(buttons, id, step))}
        onRemove={remove}
      />
      {button && <RecoveryScopes button={button} scope={scope} onScope={chooseScope} onButton={replace} />}
      <p className={cn('atlas-rc-prompt', editing.spending && 'atlas-rc-prompt--spending')} role="status">{prompt}</p>
      <RecoveryStage
        template={template}
        name={name}
        metrics={metrics}
        chips={chips}
        resources={resources}
        button={button}
        scope={scope}
        buttons={buttons}
        editing={editing}
        spots={spots}
        onPick={pick}
        onSpotKey={onSpotKey}
        active={active}
        onActive={setActive}
        onKind={chooseKind}
        onPickSource={startSpending}
        onRemove={removeRule}
      />
    </div>
  );
}
