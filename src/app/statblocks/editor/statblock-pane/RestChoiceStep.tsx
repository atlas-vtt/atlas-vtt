import React, { useId } from 'react';
import { t } from '../../../i18n';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import type { ActionOffer, ChoiceOffer } from '../../../recovery/restOffer';
import type { PaneAlly } from './paneAllies';
import { RestSpendRow, RestStepper } from './RestStepper';
import { canPick, picksMissing, timesPicked, withPick, withPickFor, withPickSpend, withoutPick, type PickDraft, type RestDraft } from './restDraft';

/** The Select's value for "the resting character itself": no ally's id is empty. */
const SELF = '';

/** What a step's rows need from the chooser around them. */
export interface RestStepContext {
  readonly draft: RestDraft;
  readonly onChange: (draft: RestDraft) => void;
  /** The resting character's name, the first choice of "For". */
  readonly selfName: string;
  readonly allies: readonly PaneAlly[];
  /** Where a select's list opens, so the panel's scrolling body never cuts it. */
  readonly layer: HTMLElement | null;
}

interface PickDetailsProps {
  context: RestStepContext;
  step: number;
  choice: ChoiceOffer;
  action: ActionOffer;
  pick: PickDraft;
  /** The pick's place in its step's picks. */
  index: number;
  /** Its number among the picks of the same action, shown where there are several. */
  nth: number | null;
}

/** Whom one pick is for (where the action may be taken for another and there is anyone else), and its Spend rules. */
function PickDetails({ context, step, choice, action, pick, index, nth }: PickDetailsProps): React.JSX.Element | null {
  const forId = useId();
  const { draft, onChange, selfName, allies, layer } = context;
  const choosesWhom = action.forOthers && allies.length > 0;
  if (!choosesWhom && action.spends.length === 0) return null;
  const options: SelectOption<string>[] = [{ value: SELF, label: selfName }, ...allies.map((ally) => ({ value: ally.id, label: ally.name }))];
  return (
    <div className="atlas-sb-rest-pick">
      {choosesWhom && (
        <div className="atlas-sb-rest-pick__for">
          <span id={forId} className="atlas-sb-rest-pick__label">{nth === null ? t('rest.for') : t('rest.forNth', { n: nth })}</span>
          <Select value={pick.for ?? SELF} options={options} labelledBy={forId} layer={layer}
            onChange={(value) => onChange(withPickFor(draft, step, index, value === SELF ? null : value))} />
        </div>
      )}
      {action.spends.map((spend, at) => (
        <RestSpendRow key={spend.rule} spend={spend} units={pick.spends[at] ?? 0}
          onChange={(units) => onChange(withPickSpend(draft, step, choice, index, at, units))} />
      ))}
    </div>
  );
}

interface ActionRowProps {
  context: RestStepContext;
  step: number;
  choice: ChoiceOffer;
  action: ActionOffer;
}

/** One action of a step: its name and what it says, a switch (or, where the step repeats, a count), and each pick's details. */
function ActionRow({ context, step, choice, action }: ActionRowProps): React.JSX.Element {
  const nameId = useId();
  const { draft, onChange } = context;
  const times = timesPicked(draft, step, action.id);
  const room = canPick(draft, step, choice, action.id);
  const picks = (draft.steps[step] ?? []).flatMap((pick, index) => (pick.action === action.id ? [{ pick, index }] : []));
  const pickOnce = (by: 1 | -1): void => onChange(by > 0 ? withPick(draft, step, choice, action.id) : withoutPick(draft, step, action.id));
  return (
    <li className="atlas-sb-rest-action" data-picked={times > 0 || undefined}>
      <div className="atlas-sb-rest-row">
        <div className="atlas-sb-rest-row__text">
          <span id={nameId} className="atlas-sb-rest-row__name">{action.name}</span>
          {action.text !== '' && <span className="atlas-sb-rest-row__detail">{action.text}</span>}
        </div>
        {choice.repeat
          ? (
            <RestStepper label={action.name} value={String(times)}
              fewer={t('rest.actionFewer', { name: action.name })} more={t('rest.actionMore', { name: action.name })}
              canDecrement={times > 0} canIncrement={room} onStep={pickOnce} />
          )
          : <ToggleSwitch size="s" value={times > 0} labelledBy={nameId} disabled={times === 0 && !room} onChange={() => pickOnce(times > 0 ? -1 : 1)} />}
      </div>
      {picks.map(({ pick, index }, nth) => (
        <PickDetails key={index} context={context} step={step} choice={choice} action={action} pick={pick} index={index}
          nth={picks.length > 1 ? nth + 1 : null} />
      ))}
    </li>
  );
}

interface RestChoiceStepProps {
  context: RestStepContext;
  /** The step's place in the button's steps. */
  step: number;
  choice: ChoiceOffer;
}

/** One step of the rest chooser: its prompt, how many of its picks are made, what is still missing, and its actions. */
export function RestChoiceStep({ context, step, choice }: RestChoiceStepProps): React.JSX.Element {
  const promptId = useId();
  const picked = context.draft.steps[step]?.length ?? 0;
  const missing = picksMissing(context.draft, step, choice);
  return (
    <section className="atlas-sb-rest-step" aria-labelledby={promptId}>
      <div className="atlas-sb-rest-step__head">
        <h4 id={promptId} className="atlas-sb-rest-step__prompt">{choice.prompt}</h4>
        <span className="atlas-sb-rest-step__count">{t('rest.picked', { n: picked, max: choice.max })}</span>
      </div>
      {missing > 0 && <p className="atlas-sb-rest-step__missing">{t('rest.pickMissing', { count: missing })}</p>}
      <ul className="atlas-sb-rest-step__actions">
        {choice.actions.map((action) => <ActionRow key={action.id} context={context} step={step} choice={choice} action={action} />)}
      </ul>
    </section>
  );
}
