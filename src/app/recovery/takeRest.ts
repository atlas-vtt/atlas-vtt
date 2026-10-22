/**
 * Taking a recovery button for a player character: planned and rolled by the engine (`restPlan`,
 * `restOutcome`), written as the GM's own edits (`writeRest`), and announced to whoever follows the
 * GM's rests (`onRested`: the online table's log). The note panel calls it on the GM's press, and
 * the online table on the GM's approval of a player's request.
 */

import type { App } from 'obsidian';
import type { CharacterRest } from './characterRest';
import { announceRested, type RestSummary } from './restEvents';
import { restOutcome } from './restOutcome';
import { pickedAction, restPlan } from './restPlan';
import { restSummaryText } from './restSummary';
import type { RestChoices, RestRoller } from './restTypes';
import { writeRest, type AllyRests, type CounterWriter } from './restWrites';

/** What taking a rest came to: its summary, and why its counters could not be written (null when they were). */
export interface TakenRest {
  readonly summary: RestSummary;
  readonly problem: string | null;
}

/**
 * Takes the button `buttonId` of `rest` with the player's `choices`, rolling through `roll`, and
 * writes and announces what it changed, of the resting character and of every other one an action
 * was taken for (`allies` finds them). Null where the character offers no such button.
 */
export async function takeRest(
  app: App, rest: CharacterRest, buttonId: string, choices: RestChoices, roll: RestRoller, writeCounters?: CounterWriter, allies?: AllyRests,
): Promise<TakenRest | null> {
  const button = rest.buttons.find((each) => each.id === buttonId);
  if (!button) return null;
  const plan = restPlan(button, rest.character, choices.picks, (id) => allies?.(id)?.character ?? null);
  const outcome = restOutcome(plan, rest.character, choices, roll);
  const problem = await writeRest(app, rest, outcome, writeCounters, allies);
  const picks = choices.picks.flatMap((pick) => pickedAction(button, pick)?.name ?? []);
  const summary: RestSummary = {
    characterId: rest.asset.id,
    characterName: rest.asset.name,
    notePath: rest.notePath,
    button: { id: button.id, name: button.name },
    picks,
    changes: outcome.changes,
    skipped: outcome.skipped,
    text: restSummaryText(button.name, outcome.changes, outcome.skipped, { resting: rest.asset.id, picks }),
  };
  announceRested(app, summary);
  return { summary, problem };
}
