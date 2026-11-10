import React from 'react';
import { Plus } from 'lucide-react';
import { t } from '../../../i18n';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { withAddedChoice, withoutChoice } from '../../../recovery/editor/recoveryChoiceEdits';
import { ALWAYS, type RuleScope } from '../../../recovery/editor/recoveryScope';
import { MAX_RECOVERY_CHOICES, type RecoveryButton } from '../../../recovery/recoveryTypes';
import { RecoveryStep, stepKeys } from './RecoveryStep';
import { ScopeChip } from './ScopeChip';
import { useFocusRequests } from './useFocusRequests';

interface RecoveryScopesProps {
  button: RecoveryButton;
  /** What the card's spots edit: the button's own rules, or one action's. */
  scope: RuleScope;
  onScope: (scope: RuleScope) => void;
  onButton: (button: RecoveryButton) => void;
}

const ADD_STEP = 'add-step';

/**
 * Under the selected button, what it does: Always (the rules it applies every time) and its steps,
 * each with its actions. Picking Always or an action makes the card's spots edit its rules; Add a
 * step brings a step asking for exactly one of a single action, whose prompt takes focus.
 */
export function RecoveryScopes({ button, scope, onScope, onButton }: RecoveryScopesProps): React.ReactElement {
  const focus = useFocusRequests();
  const choices = button.choices ?? [];
  const full = choices.length >= MAX_RECOVERY_CHOICES;

  const addStep = (): void => {
    const added = withAddedChoice(button, t('recoveryEditor.step.defaultPrompt'), t('recoveryEditor.step.defaultAction'));
    if (!added) return;
    onButton(added.button);
    onScope(added.scope);
    focus.request(stepKeys.prompt(added.scope.choice));
  };

  const removeStep = (id: string): void => {
    onButton(withoutChoice(button, id));
    if (scope.kind === 'action' && scope.choice === id) onScope(ALWAYS);
    focus.request(ADD_STEP);
  };

  const add = (
    <button ref={focus.register(ADD_STEP)} type="button" className="atlas-rc-scopes__add" aria-disabled={full || undefined} onClick={addStep}>
      <Plus aria-hidden="true" />
      {t('recoveryEditor.addStep')}
    </button>
  );

  return (
    <div className="atlas-rc-scopes" role="group" aria-label={t('recoveryEditor.scopes', { button: button.name })}>
      <div className="atlas-rc-scopes__top">
        <ScopeChip name={t('recoveryEditor.always')} tip={t('recoveryEditor.alwaysTip')} count={button.rules.length}
          selected={scope.kind === 'always'} onSelect={() => onScope(ALWAYS)} />
        {full ? <LabelTooltip label={t('recoveryEditor.addStepFull', { count: MAX_RECOVERY_CHOICES })}>{add}</LabelTooltip> : add}
      </div>
      {choices.map((choice) => (
        <RecoveryStep key={choice.id} button={button} choice={choice} scope={scope} onScope={onScope} onButton={onButton}
          onRemove={() => removeStep(choice.id)} focus={focus} />
      ))}
    </div>
  );
}
