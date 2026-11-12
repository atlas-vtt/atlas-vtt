import type { StoreApi } from 'zustand';
import type { ContextMenuEntry, MenuStepper } from './AtlasContextMenu';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { countsHeight, heightField, MAX_TOKEN_HEIGHT, signedHeight, steppedHeight, tokenHeight } from '../../../measure/tokenHeight';
import type { ViewAtlasState } from '../../../storeFactory';
import { t } from '../../../i18n';

type HeightStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>;

/**
 * "Height" for the tokens `tokenIds` (the selection, or the token clicked): − value + in steps of
 * one cell's distance, each token from its own height, and a row that puts them all on the floor.
 * Below the floor is a height too (a pit, a swimmer). Every step is one store write, so one undo
 * step. The submenu stays open and follows the tokens. None where the map measures in range bands.
 */
export function tokenHeightSubmenu(store: HeightStore, tokenIds: readonly string[], measurement: () => MeasurementSettings): ContextMenuEntry | null {
  if (!countsHeight(measurement())) return null;
  const heightsNow = (): number[] => {
    const tokens = store.getState().objects.tokens;
    return tokenIds.flatMap((id) => (tokens[id] ? [tokenHeight(tokens[id])] : []));
  };
  const setHeights = (next: (height: number) => number): void => {
    const state = store.getState();
    state.updateTokens(tokenIds.flatMap((id) => {
      const token = state.objects.tokens[id];
      return token ? [{ id, changes: heightField(next(tokenHeight(token))) }] : [];
    }));
  };
  const children = (): ContextMenuEntry[] => {
    const settings = measurement();
    const heights = heightsNow();
    const step = (steps: number): void => setHeights((height) => steppedHeight(height, steps, settings.unitDistance));
    return [
      { type: 'item', label: t('token.height'), keepOpen: true, onClick: () => undefined, stepper: heightStepper(heights, settings, step) },
      { type: 'item', label: t('token.onTheFloor'), keepOpen: true, disabled: heights.every((height) => height === 0), onClick: () => setHeights(() => 0) },
    ];
  };
  const subscribe = (onChange: () => void): (() => void) =>
    store.subscribe((state, previous) => {
      if (state.objects.tokens !== previous.objects.tokens) onChange();
    });
  return { type: 'submenu', label: t('token.height'), icon: 'move-vertical', children, subscribe };
}

/** The shared height, or its range where the tokens differ ("10ft–30ft"). */
function heightStepper(heights: readonly number[], settings: MeasurementSettings, step: (steps: number) => void): MenuStepper {
  const low = heights.length > 0 ? Math.min(...heights) : 0;
  const high = heights.length > 0 ? Math.max(...heights) : 0;
  return {
    value: low === high ? signedHeight(low, settings) : `${signedHeight(low, settings)}–${signedHeight(high, settings)}`,
    label: t('token.height'),
    canDecrement: heights.some((height) => height > -MAX_TOKEN_HEIGHT),
    onDecrement: () => step(-1),
    onIncrement: () => step(1),
  };
}
