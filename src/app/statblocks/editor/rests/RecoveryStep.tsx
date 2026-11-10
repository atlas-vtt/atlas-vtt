import React, { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import {
  canRemoveAction, mostPicks, pickMode, withActionChanged, withAddedAction, withChoiceChanged, withoutAction,
  withPicks, withPrompt, withRepeat, type PickMode,
} from '../../../recovery/editor/recoveryChoiceEdits';
import type { RuleScope } from '../../../recovery/editor/recoveryScope';
import { MAX_RECOVERY_TEXT } from '../../../recovery/parseRecovery';
import { MAX_RECOVERY_ACTIONS, type RecoveryButton, type RecoveryChoice } from '../../../recovery/recoveryTypes';
import { ActionFields } from './ActionFields';
import { CommitTextInput } from './CommitTextInput';
import { ScopeChip } from './ScopeChip';
import type { FocusRequests } from './useFocusRequests';

interface RecoveryStepProps {
  button: RecoveryButton;
  choice: RecoveryChoice;
  scope: RuleScope;
  onScope: (scope: RuleScope) => void;
  onButton: (button: RecoveryButton) => void;
  /** Removes the step; the editor moves focus on. */
  onRemove: () => void;
  focus: FocusRequests;
}

/** Focus keys of a step's parts. */
export const stepKeys = {
  prompt: (choice: string): string => `prompt:${choice}`,
  chip: (choice: string, action: string): string => `chip:${choice}:${action}`,
  name: (choice: string, action: string): string => `name:${choice}:${action}`,
  addAction: (choice: string): string => `add-action:${choice}`,
};

/**
 * One step of a button: the prompt the player is asked, how many actions they pick (exactly or
 * up to a number, and whether one may be picked again), its actions as capsules that make the
 * card's spots edit that action's rules, and the fields of the one selected.
 */
export function RecoveryStep({ button, choice, scope, onScope, onButton, onRemove, focus }: RecoveryStepProps): React.ReactElement {
  const countId = useId();
  const repeatId = useId();
  const selected = scope.kind === 'action' && scope.choice === choice.id ? choice.actions.find((action) => action.id === scope.action) : undefined;
  const actionsFull = choice.actions.length >= MAX_RECOVERY_ACTIONS;
  const change = (edit: (each: RecoveryChoice) => RecoveryChoice): void => onButton(withChoiceChanged(button, choice.id, edit));
  const counts: SelectOption<string>[] = Array.from({ length: mostPicks(choice) }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
  const actionScope = (action: string): RuleScope => ({ kind: 'action', choice: choice.id, action });

  const addAction = (): void => {
    const added = withAddedAction(button, choice.id, t('recoveryEditor.step.defaultAction'));
    if (!added) return;
    onButton(added.button);
    onScope(added.scope);
    focus.request(stepKeys.name(choice.id, added.scope.action));
  };

  const removeAction = (id: string): void => {
    const next = withoutAction(button, choice.id, id);
    if (!next) return;
    const at = choice.actions.findIndex((action) => action.id === id);
    const neighbour = choice.actions[at + 1] ?? choice.actions[at - 1];
    onButton(next);
    if (neighbour) {
      onScope(actionScope(neighbour.id));
      focus.request(stepKeys.chip(choice.id, neighbour.id));
    }
  };

  const onChipKey = (event: React.KeyboardEvent, id: string): void => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault();
    event.stopPropagation();
    removeAction(id);
  };

  return (
    <section className="atlas-rc-step" aria-label={choice.prompt}>
      <div className="atlas-rc-step__row">
        <CommitTextInput ref={focus.register(stepKeys.prompt(choice.id))} className="atlas-rc-step__prompt" value={choice.prompt} required
          maxLength={MAX_RECOVERY_TEXT} label={t('recoveryEditor.step.prompt')} onCommit={(prompt) => change((each) => withPrompt(each, prompt))} />
        <LabelTooltip label={t('recoveryEditor.step.remove')}>
          <button type="button" className="atlas-rc-scopes__remove" onClick={onRemove}>
            <Trash2 aria-hidden="true" />
          </button>
        </LabelTooltip>
      </div>
      <div className="atlas-rc-step__row atlas-rc-step__row--wrap">
        <SegmentedControl<PickMode> ariaLabel={t('recoveryEditor.step.mode')} value={pickMode(choice)} roving
          options={[{ value: 'exactly', label: t('recoveryEditor.step.exactly') }, { value: 'upTo', label: t('recoveryEditor.step.upTo') }]}
          onChange={(mode) => change((each) => withPicks(each, mode, each.max))} />
        <span id={countId} hidden>{t('recoveryEditor.step.count')}</span>
        <div className="atlas-rc-step__count">
          <Select value={String(choice.max)} options={counts} labelledBy={countId}
            onChange={(count) => change((each) => withPicks(each, pickMode(each), Number(count)))} />
        </div>
        <div className="atlas-rc-switch">
          <span id={repeatId} className="atlas-csm-toggle-label">{t('recoveryEditor.step.repeat')}</span>
          <ToggleSwitch size="s" value={choice.repeat === true} labelledBy={repeatId}
            onChange={() => change((each) => withRepeat(each, each.repeat !== true))} />
        </div>
      </div>
      <div className="atlas-rc-step__actions" role="group" aria-label={t('recoveryEditor.step.actions')}>
        {choice.actions.map((action) => (
          <ScopeChip key={action.id} name={action.name} count={action.rules.length} selected={selected?.id === action.id}
            chipRef={focus.register(stepKeys.chip(choice.id, action.id))} onSelect={() => onScope(actionScope(action.id))}
            onKeyDown={(event) => onChipKey(event, action.id)} />
        ))}
        <LabelTooltip label={actionsFull ? t('recoveryEditor.step.addActionFull', { count: MAX_RECOVERY_ACTIONS }) : t('recoveryEditor.step.addAction')}>
          <button ref={focus.register(stepKeys.addAction(choice.id))} type="button" className="atlas-rc-rail__add"
            aria-disabled={actionsFull || undefined} onClick={addAction}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
      </div>
      {selected && (
        <ActionFields key={selected.id} action={selected} removable={canRemoveAction(choice)}
          nameRef={focus.register(stepKeys.name(choice.id, selected.id))}
          onChange={(action) => onButton(withActionChanged(button, choice.id, action.id, () => action))}
          onRemove={() => removeAction(selected.id)} />
      )}
    </section>
  );
}
