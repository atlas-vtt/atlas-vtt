/**
 * A remote view's dice: the shared log its owner feeds (shown in Atlas's dice log, never saved
 * and never sent through Atlas's document-wide dice event), the player's own rolls it throws, and
 * the rolls the player asks for from the dice tray or Roll again, which go to the owner's
 * `onRoll` listeners. The status bar's status lives here too: it is the owner's text and buttons.
 */
import { isDiceRollResult, plainCopy } from '../../api/diceRollCheck';
import { frozenCopy } from '../../api/frozen';
import { noteThrown, thrownBefore } from '../dice3d/givenThrows';
import type { RemoteStatus, RemoteStatusAction } from '../../api/types/remoteViews';
import type { ViewAtlasStore } from '../storeFactory';
import { isDieType, type DiceRollResult } from '../tools/diceRolling';
import { withCleanTags } from '../tools/diceTags';
import { callGuarded, ListenerSet } from './listeners';
import { ROLL_NOT_SENT } from './remoteControls';
import { updateRemoteView, type ShownStatus, type ShownStatusAction } from './remoteViewState';
import { t } from '../i18n';

/** The most dice a remote view's tray may offer for one roll (`remoteViews.open({ maxDice })`, its default). */
export const REMOTE_MAX_DICE = 100;
/** The most entries of the shared log the dice log shows. */
export const REMOTE_LOG_ENTRIES = 100;
/** Why a pick of the wrong size is not sent. */
export const rollDiceCount = (maxDice: number): string => t('remote.rollDiceCount', { max: maxDice });

export type RollListener = (dice: Readonly<Record<string, number>>, modifier: number) => string | null;

/** The dice and modifier a logged roll used, to roll it again; null when the tray could not roll it. */
export function rollOfResult(result: DiceRollResult): { dice: Record<string, number>; modifier: number } | null {
  if (result.unlistedDice) return null;
  const dice: Record<string, number> = {};
  let count = 0;
  for (const roll of result.rolls) {
    // Dice an explosion rolled are not the roll's own: the rules roll them again.
    if (roll.exploded) continue;
    if (!isDieType(roll.die) || roll.negative) return null;
    dice[roll.die] = (dice[roll.die] ?? 0) + 1;
    count++;
  }
  if (count === 0 || count > REMOTE_MAX_DICE || !Number.isSafeInteger(result.modifiers)) return null;
  return { dice, modifier: result.modifiers };
}

/** The most buttons a status may have, `action` and `actions` together, so the status bar keeps them on one row. */
export const REMOTE_STATUS_ACTIONS = 3;

const text = (value: unknown): value is string => typeof value === 'string';
const name = (value: unknown): value is string => text(value) && value !== '';

function isAction(value: unknown): value is RemoteStatusAction {
  const action = value as Partial<RemoteStatusAction> | null;
  return typeof action === 'object' && action !== null && name(action.id) && name(action.label) && (action.icon === undefined || name(action.icon));
}

/** Each field of an action read once, so a getter cannot change it after the check. */
function takenAction(value: unknown): Partial<Record<keyof RemoteStatusAction, unknown>> | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, label, icon } = value as Partial<RemoteStatusAction>;
  return { id, label, icon };
}

/** The owner's `actions`, copied, checked and frozen, each telling `choose` its id; throws for a malformed list. */
function checkedActions(given: unknown, room: number, choose: (id: string) => void): readonly ShownStatusAction[] {
  const actions = Array.isArray(given) ? given.slice(0, room + 1).map(takenAction) : null;
  const valid = actions !== null && Array.isArray(given) && given.length <= room && actions.every(isAction)
    && new Set(actions.map((action) => action.id)).size === actions.length;
  if (!valid) {
    throw new Error(`[Atlas API] RemoteView.setStatus: "actions" must list { id, label, icon? } with distinct ids and non-empty text, at most ${REMOTE_STATUS_ACTIONS} buttons with "action" (${room} left).`);
  }
  return Object.freeze(actions.map(({ id, label, icon }) => Object.freeze({
    id, label, ...(icon !== undefined ? { icon } : {}), run: (): void => { choose(id); },
  })));
}

function checkedStatus(status: unknown, choose: (id: string) => void): ShownStatus {
  // Every field is read once, then checked, so a getter cannot change it after the check.
  const { title, connection, tone, message, action, actions: listed } = (status ?? {}) as Partial<RemoteStatus>;
  const tones: readonly unknown[] = ['connected', 'pending', 'ended'];
  const { label, run } = (action ?? {}) as { label?: unknown; run?: unknown };
  const valid = text(title) && text(connection) && tones.includes(tone) && (message === null || text(message))
    && (action === undefined || (text(label) && typeof run === 'function'));
  if (!valid) throw new Error('[Atlas API] RemoteView.setStatus: the status must be a RemoteStatus.');
  const actions = listed === undefined ? undefined : checkedActions(listed, REMOTE_STATUS_ACTIONS - (action ? 1 : 0), choose);
  const bound = typeof run === 'function' ? (run as () => void).bind(action) : null;
  return Object.freeze({
    title, connection, tone: tone as RemoteStatus['tone'], message,
    ...(bound ? { action: Object.freeze({ label, run: (): void => { callGuarded('status action', bound); } }) } : {}),
    ...(actions ? { actions } : {}),
  }) as ShownStatus;
}

/** A copy of `value` to check, so nothing the caller changes afterwards gets past the check; throws for `method` when it is not plain data. */
function copyToCheck(method: string, value: unknown): unknown {
  const copy = plainCopy(value);
  if (copy === null) throw new Error(`[Atlas API] RemoteView.${method}: the roll must be plain data.`);
  return copy;
}

/**
 * `result` as a remote view shows it: of its `source`, only whether it came from the toolbar or a
 * statblock. A remote view is a player view that knows no roll's origin, so, as the player window
 * does for a roll without one (Atlas #319), it names no token, shows no portrait or ability, and
 * looks nothing up in the vault for it. Who rolled it (`rolledBy`) stays.
 */
export function withoutRollSource(result: DiceRollResult): DiceRollResult {
  if (result.source === undefined) return result;
  const { source, ...rest } = result;
  const type = (source as { type?: unknown } | null)?.type;
  return type === 'toolbar' || type === 'statblock' ? { ...rest, source: { type } } : rest;
}

export class RemoteViewDice {
  readonly rolls = new ListenerSet<RollListener>('onRoll');
  /** Told the id of the status action the player chose. */
  readonly statusActions = new ListenerSet<(id: string) => void>('onStatusAction');

  constructor(private readonly store: ViewAtlasStore, private readonly maxDice: number = REMOTE_MAX_DICE) {
    updateRemoteView(store, { maxDice });
  }

  setStatus(status: unknown): void {
    updateRemoteView(this.store, { status: checkedStatus(status, (id) => this.chooseAction(id)) });
  }

  setDiceLog(entries: unknown): void {
    const kept = copyToCheck('setDiceLog', Array.isArray(entries) ? entries.slice(0, REMOTE_LOG_ENTRIES) : entries);
    if (!Array.isArray(kept) || !kept.every(isDiceRollResult)) throw new Error('[Atlas API] RemoteView.setDiceLog: the entries must be dice roll results.');
    // A die's tag that is not well-formed is dropped, never the roll; no entry names a token (`withoutRollSource`).
    updateRemoteView(this.store, { diceLog: frozenCopy(kept.map((entry) => withoutRollSource(withCleanTags(entry)))) });
  }

  /** Throws `result` once: an id this view threw before (of the last 100, `dice.throw` included) is ignored. */
  throwRoll(given: unknown): void {
    const result = copyToCheck('throwRoll', given);
    if (!isDiceRollResult(result)) throw new Error('[Atlas API] RemoteView.throwRoll: the result must be a dice roll result.');
    if (thrownBefore(this.store, result.id)) return;
    noteThrown(this.store, result.id);
    updateRemoteView(this.store, { ownRoll: frozenCopy(withoutRollSource(withCleanTags(result))) });
  }

  /** The look the view's rolls are thrown in: a full look id, `''` for Atlas's dice, or null for the player's own. */
  setDiceLook(given: unknown): void {
    if (given !== null && (typeof given !== 'string' || given.length > 300)) {
      throw new Error('[Atlas API] RemoteView.setDiceLook: the look must be a look id of at most 300 characters, or null.');
    }
    updateRemoteView(this.store, { diceLookId: given });
  }

  /** Asks the listeners in turn until one sends the roll; null once sent, else the first reason given. */
  roll(dice: Readonly<Record<string, number>>, modifier: number): string | null {
    const picked: Record<string, number> = {};
    let total = 0;
    for (const [die, count] of Object.entries(dice)) {
      if (!isDieType(die) || !Number.isSafeInteger(count) || count <= 0) continue;
      picked[die] = count;
      total += count;
    }
    if (total < 1 || total > this.maxDice) return rollDiceCount(this.maxDice);
    const selection = Object.freeze(picked);
    const sent = Number.isSafeInteger(modifier) ? modifier : 0;
    let reason: string | null = null;
    for (const listener of this.rolls.list()) {
      const answer = callGuarded('roll', listener, selection, sent);
      if (answer === null) return null;
      reason ??= typeof answer === 'string' && answer !== '' ? answer : ROLL_NOT_SENT;
    }
    return reason ?? ROLL_NOT_SENT;
  }

  dispose(): void {
    this.rolls.close();
    this.statusActions.close();
  }

  private chooseAction(id: string): void {
    for (const listener of this.statusActions.list()) callGuarded('status action', listener, id);
  }
}
