/**
 * What the rest chooser holds while the player decides: how many units each of the button's own
 * Spend rules spends, and the actions picked in each step, each with whom it is for and its own
 * spends. Turned into a `RestRequest` that `checkRest` answers. Pure.
 */

import type { ChoiceOffer, RestOffer, RestRequest } from '../../../recovery/restOffer';

/** One picked action: for whom (null: the resting character) and its Spend rules' units in its offer's order. */
export interface PickDraft {
  readonly action: string;
  readonly for: string | null;
  readonly spends: readonly number[];
}

/** The button's own spends in its offer's order, and each step's picks in the offer's step order, in action order within a step. */
export interface RestDraft {
  readonly spends: readonly number[];
  readonly steps: ReadonlyArray<readonly PickDraft[]>;
}

/** Nothing spent, nothing picked. */
export function emptyDraft(offer: RestOffer): RestDraft {
  return { spends: offer.spends.map(() => 0), steps: offer.choices.map(() => []) };
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

/** The button's own Spend rule `index` set to `units`, within 0 and what the offer allows. */
export function withSpend(draft: RestDraft, offer: RestOffer, index: number, units: number): RestDraft {
  const max = offer.spends[index]?.max ?? 0;
  return { ...draft, spends: draft.spends.map((value, at) => (at === index ? clamp(units, max) : value)) };
}

function withStep(draft: RestDraft, step: number, picks: readonly PickDraft[]): RestDraft {
  return { ...draft, steps: draft.steps.map((each, at) => (at === step ? picks : each)) };
}

/** How many times `action` is picked in `step`. */
export function timesPicked(draft: RestDraft, step: number, action: string): number {
  return (draft.steps[step] ?? []).filter((pick) => pick.action === action).length;
}

/** Whether `action` can be picked (once more) in `choice`: room left in the step, and not picked yet unless the step repeats. */
export function canPick(draft: RestDraft, step: number, choice: ChoiceOffer, action: string): boolean {
  const picks = draft.steps[step] ?? [];
  if (!choice.repeat && timesPicked(draft, step, action) > 0) return false;
  return picks.length < choice.max || (choice.max === 1 && !choice.repeat);
}

/**
 * `action` picked once more in `choice` (the `step`th), for the resting character and spending
 * nothing yet; where a step takes one action and has it, the new one takes its place. Unchanged
 * where it cannot be picked.
 */
export function withPick(draft: RestDraft, step: number, choice: ChoiceOffer, action: string): RestDraft {
  const offered = choice.actions.findIndex((each) => each.id === action);
  if (offered < 0 || !canPick(draft, step, choice, action)) return draft;
  const picks = draft.steps[step] ?? [];
  const kept = picks.length < choice.max ? picks : [];
  const pick: PickDraft = { action, for: null, spends: choice.actions[offered]!.spends.map(() => 0) };
  const order = (id: string): number => choice.actions.findIndex((each) => each.id === id);
  const after = kept.filter((each) => order(each.action) <= offered).length;
  return withStep(draft, step, [...kept.slice(0, after), pick, ...kept.slice(after)]);
}

/** The last pick of `action` in `step` taken back. */
export function withoutPick(draft: RestDraft, step: number, action: string): RestDraft {
  const picks = draft.steps[step] ?? [];
  const last = picks.map((pick) => pick.action).lastIndexOf(action);
  return last < 0 ? draft : withStep(draft, step, picks.filter((_, at) => at !== last));
}

/** The `index`th pick of `step` taken for `target` (null: the resting character). */
export function withPickFor(draft: RestDraft, step: number, index: number, target: string | null): RestDraft {
  const picks = draft.steps[step] ?? [];
  return withStep(draft, step, picks.map((pick, at) => (at === index ? { ...pick, for: target } : pick)));
}

/** The `index`th pick of `step` spending `units` on its Spend rule `spend`, within 0 and its offer's `max`. */
export function withPickSpend(draft: RestDraft, step: number, choice: ChoiceOffer, index: number, spend: number, units: number): RestDraft {
  const picks = draft.steps[step] ?? [];
  return withStep(draft, step, picks.map((pick, at) => {
    if (at !== index) return pick;
    const max = choice.actions.find((each) => each.id === pick.action)?.spends[spend]?.max ?? 0;
    return { ...pick, spends: pick.spends.map((value, which) => (which === spend ? clamp(units, max) : value)) };
  }));
}

/** How many more picks `choice` needs before it is complete. */
export function picksMissing(draft: RestDraft, step: number, choice: ChoiceOffer): number {
  return Math.max(0, choice.min - (draft.steps[step]?.length ?? 0));
}

/** The request the draft makes of `offer`: every step's picks in step order. */
export function draftRequest(offer: RestOffer, draft: RestDraft): RestRequest {
  const picks = offer.choices.flatMap((choice, step) => (draft.steps[step] ?? []).map((pick) => ({
    choice: choice.id, action: pick.action, for: pick.for, spends: pick.spends,
  })));
  return { button: offer.id, spends: draft.spends, picks };
}
