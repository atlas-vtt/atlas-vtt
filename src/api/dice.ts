import type { App } from 'obsidian';
import { landsOnAFace } from '../app/dice3d/diceScene';
import { showAsCardOnly } from '../app/dice3d/rollPresentation';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { DiceFormulaError, rollByRules, type DiceRollResult } from '../app/tools/diceRolling';
import { announceRoll, followRolls } from '../app/tools/diceRollFeed';
import { withCleanTags } from '../app/tools/diceTags';
import { isDiceRollResult, plainCopy, ROLL_TEXT_MAX } from './diceRollCheck';
import { throwGivenRoll } from './diceThrow';
import type { DisposerSet } from './disposers';
import { isRemoteView } from './viewInfo';
import { acceptsListener } from './listenerCheck';
import { frozenCopy } from './frozen';
import type { Disposer, ViewId } from './types/common';
import type { ViewTracker } from './viewTracker';
import type { DiceApi, DicePublishOptions, DiceRollRequest } from './types/dice';

const isString = (value: unknown): value is string => typeof value === 'string';

/** Whether `publish` throws its roll in 3D: true unless `options.throw` is false; anything else malformed throws. */
function publishThrows(options: unknown): boolean {
  if (options === undefined) return true;
  const flag: unknown = typeof options === 'object' && options !== null ? Reflect.get(options, 'throw') : null;
  if (flag !== undefined && typeof flag !== 'boolean') throw new Error('[Atlas API] dice.publish: the options must be { throw?: boolean }.');
  return flag !== false;
}

function assertRequest(request: unknown): asserts request is DiceRollRequest {
  const given = request as Partial<DiceRollRequest> | null;
  const valid = typeof given === 'object' && given !== null && isString(given.formula)
    && (given.mapPath === undefined || given.mapPath === null || isString(given.mapPath))
    && (given.rolledBy === undefined || (isString(given.rolledBy) && given.rolledBy.length <= ROLL_TEXT_MAX.rolledBy));
  if (!valid) throw new Error(`[Atlas API] dice.roll: the request must be { formula: string, mapPath?: string | null, rolledBy?: string of at most ${ROLL_TEXT_MAX.rolledBy} characters }.`);
}

/**
 * `views` finds the map views a roll shows in and `throw` throws in (none without it). `onRolled` follows Atlas's roll
 * feed (`diceRollFeed.ts`), which announces every roll Atlas logs once, whichever view or window made it. `registerLook`
 * is set only with the `dice-looks` capability (`diceLooks.ts`).
 */
export function diceApi(
  app: App, disposers: DisposerSet, views: ViewTracker | null = null, registerLook?: DiceApi['registerLook'], registerColours?: DiceApi['registerColours'],
  lookChoice?: Pick<Required<DiceApi>, 'useLook' | 'lookFor'>,
): DiceApi {
  const dispatch = (result: DiceRollResult): void => {
    // Atlas's own log, toasts, sounds and the player window follow each map view's bus (#277): every open GM
    // map view hears the roll, a remote view none (its log is its owner's). One view's failure never stops the others.
    for (const view of views?.views() ?? []) {
      if (isRemoteView(view)) continue;
      try {
        view.serviceManager?.getEventBus().emit('dice-rolled', result);
      } catch (error) {
        console.error('[Atlas API] A map view could not show a roll:', error);
      }
    }
    announceRoll(result);
  };
  return Object.freeze({
    roll: (request: DiceRollRequest): DiceRollResult => {
      assertRequest(request);
      let rolled: DiceRollResult;
      try {
        rolled = rollByRules(request.formula, mapDiceRules(app, request.mapPath ?? null));
      } catch (error) {
        // Atlas's dice tray refuses the same formulas (#275); nothing was rolled or logged.
        if (error instanceof DiceFormulaError) throw new Error(`[Atlas API] dice.roll: ${error.message}`);
        throw error;
      }
      const result = request.rolledBy ? { ...rolled, rolledBy: request.rolledBy } : rolled;
      dispatch(result);
      return frozenCopy(result);
    },
    onRolled: (listener: (result: DiceRollResult) => void): Disposer => {
      if (!acceptsListener('dice.onRolled', listener)) return () => undefined;
      const unfollow = followRolls((result) => {
        try {
          listener(frozenCopy(result));
        } catch (error) {
          console.error('[Atlas API] A dice listener failed:', error);
        }
      });
      return disposers.add(unfollow);
    },
    publish: (result: DiceRollResult, options?: DicePublishOptions): void => {
      const throwIt = publishThrows(options);
      // Copied first and the copy checked, so nothing the caller changes afterwards gets past the check.
      const copy = plainCopy(result);
      if (copy === null) throw new Error('[Atlas API] dice.publish: the roll must be plain data.');
      if (!isDiceRollResult(copy)) throw new Error('[Atlas API] dice.publish: the roll must be { id, timestamp, formula, rolls, modifiers, total }.');
      // A die's tag that is not well-formed is dropped, never the roll.
      const shown = withCleanTags(copy);
      if (!throwIt) showAsCardOnly(shown);
      dispatch(shown);
    },
    throw: (viewId: ViewId, roll: DiceRollResult): boolean => {
      const copy = plainCopy(roll);
      return copy !== null && isDiceRollResult(copy) && copy.rolls.every(landsOnAFace) && throwGivenRoll(app, views, viewId, withCleanTags(copy));
    },
    ...(registerLook ? { registerLook } : {}),
    ...(registerColours ? { registerColours } : {}),
    ...(lookChoice ?? {}),
  });
}
