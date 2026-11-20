import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { RulesLookup } from '../gameSystems/mapRules';
import { mapMeasurementSettings } from '../services/mapMeasurementSettings';
import { mapMovementRules } from '../services/mapMovementRules';
import type { ViewAtlasState } from '../storeFactory';
import type { RangeSources } from './measure/RangeMarks';
import type { TokenRenderer } from './TokenRenderer';
import { tokenMovement } from './token-renderer/tokenMovement';

/**
 * What the measure tool's range marks ask of a view's tokens: the token under the pointer, by the
 * hit test a click picks tokens with (so one the canvas hides is never found), and the map's
 * movement rules with its tokens' speeds, read when asked. Without a token renderer nothing is hit.
 */
export function measureRangeSources(deps: {
  app: App;
  store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  rules: RulesLookup;
  tokens: () => Pick<TokenRenderer, 'hitTestTokens'> | undefined;
}): RangeSources {
  const { app, store, rules } = deps;
  return {
    tokenAt: (x, y) => deps.tokens()?.hitTestTokens(x, y) ?? null,
    movement: tokenMovement(app, () => mapMovementRules(app, store.getState().mapPath), () => mapMeasurementSettings(rules, store.getState())),
  };
}
