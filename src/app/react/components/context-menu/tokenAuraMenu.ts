import type { StoreApi } from 'zustand';
import type { ContextMenuEntry, MenuStepper } from './AtlasContextMenu';
import { formatDistance, type MeasurementSettings } from '../../../grid/measurementFormat';
import { t } from '../../../i18n';
import { auraCells, auraDirection, auraPoints, steppedAura } from '../../../measure/auraArea';
import { aurasOf } from '../../../measure/auraUpkeep';
import { isAura, readMeasure } from '../../../measure/keptMeasures';
import type { KeptAura } from '../../../measure/measureTypes';
import { countsHeight } from '../../../measure/tokenHeight';
import { showMeasuresFullNotice } from '../../../pixi/measure/measureNotices';
import type { ViewAtlasState } from '../../../storeFactory';
import type { TokenAura } from '../../../stores/measuresSlice';

type AuraStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>;

/** The aura the token menu steps: the first one kept for the token; null where it has none. */
function auraOf(state: Pick<ViewAtlasState, 'objects'>, tokenId: string): KeptAura | null {
  const { measures } = state.objects;
  const id = aurasOf(measures, new Set([tokenId]))[0];
  const measure = id === undefined ? null : readMeasure(id, measures?.[id]);
  return measure && isAura(measure) ? measure : null;
}

/**
 * "Aura" for the tokens `tokenIds` (the selection, or the token clicked): − value + in steps of one
 * cell's distance, each token from its own aura, and a row that takes them all away. The first
 * step up gives a token its aura, in the measure tool's colour and shown to players as the tool
 * says; a step down to nothing removes it. Every step is one store write, so one undo step. The
 * submenu stays open and follows the tokens. None where the map measures in range bands: an aura
 * reaches a distance, as a height is one (`countsHeight`).
 */
export function tokenAuraSubmenu(store: AuraStore, tokenIds: readonly string[], measurement: () => MeasurementSettings): ContextMenuEntry | null {
  if (!countsHeight(measurement())) return null;
  const aurasNow = (): number[] => {
    const state = store.getState();
    return tokenIds.flatMap((id) => (state.objects.tokens[id] ? [auraOf(state, id)?.aura ?? 0] : []));
  };
  const setAuras = (next: (aura: number) => number): void => {
    const state = store.getState();
    const { unitDistance } = measurement();
    const grid = { size: state.grid?.size ?? 0 };
    const auras = tokenIds.flatMap((tokenId): TokenAura[] => {
      const token = state.objects.tokens[tokenId];
      if (!token) return [];
      const known = auraOf(state, tokenId);
      const aura = next(known?.aura ?? 0);
      return [{ tokenId, aura, points: auraPoints(token, auraCells(aura, unitDistance), grid, known ? auraDirection(known) : undefined) }];
    });
    const { color, players } = state.measureTool;
    if (!state.setTokenAuras(auras, { ...(color !== null && { color }), ...(!players && { hidden: true }) })) showMeasuresFullNotice();
  };
  const children = (): ContextMenuEntry[] => {
    const settings = measurement();
    const auras = aurasNow();
    const step = (steps: number): void => setAuras((aura) => steppedAura(aura, steps, settings.unitDistance));
    return [
      { type: 'item', label: t('token.aura'), keepOpen: true, onClick: () => undefined, stepper: auraStepper(auras, settings, step) },
      { type: 'item', label: t('token.noAura'), keepOpen: true, disabled: auras.every((aura) => aura === 0), onClick: () => setAuras(() => 0) },
    ];
  };
  const subscribe = (onChange: () => void): (() => void) =>
    store.subscribe((state, previous) => {
      if (state.objects.measures !== previous.objects.measures || state.objects.tokens !== previous.objects.tokens) onChange();
    });
  return { type: 'submenu', label: t('token.aura'), icon: 'circle-dot', children, subscribe };
}

/** The shared reach, or its range where the tokens differ ("5ft–10ft"). */
function auraStepper(auras: readonly number[], settings: MeasurementSettings, step: (steps: number) => void): MenuStepper {
  const low = auras.length > 0 ? Math.min(...auras) : 0;
  const high = auras.length > 0 ? Math.max(...auras) : 0;
  const written = (aura: number): string => formatDistance(auraCells(aura, settings.unitDistance), settings);
  return {
    value: low === high ? written(low) : `${written(low)}–${written(high)}`,
    label: t('token.aura'),
    canDecrement: high > 0,
    onDecrement: () => step(-1),
    onIncrement: () => step(1),
  };
}
