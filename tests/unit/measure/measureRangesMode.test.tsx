// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { NO_MOVEMENT_RULES, type MovementRules } from '../../../src/app/measure/movementRules';

/** The rules the map of the bar plays by; set before the bar is rendered. */
const rules = vi.hoisted(() => ({ settings: null as MeasurementSettings | null, movement: null as MovementRules | null }));

// The bar reads the map's rules through the app; here they are handed to it.
vi.mock('../../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app: {}, view: null }),
}));
vi.mock('../../../src/app/react/hooks/useMapRulesRevision', () => ({ useMapRulesRevision: () => 0 }));
vi.mock('../../../src/app/services/mapRules', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/services/mapRules')>(),
  rulesLookup: () => ({}),
}));
vi.mock('../../../src/app/services/mapMeasurementSettings', () => ({ mapMeasurementSettings: () => rules.settings }));
vi.mock('../../../src/app/services/mapMovementRules', () => ({ mapMovementRules: () => rules.movement }));
vi.mock('../../../src/app/keyboard/useMapHotkeys', () => ({ useHotkeyLabels: () => () => 'G', useAtlasSettings: () => undefined }));

import { MeasureToolBar } from '../../../src/app/packages/components/toolbar/MeasureToolBar';
import { MEASURE_MODES, nextMeasureMode } from '../../../src/app/packages/components/toolbar/measureToolChoices';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const BANDED: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 3 }, { name: 'Far', maxSquares: 4 }] };
const MOVES: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }], countPerTurn: false };

function renderBar(settings: MeasurementSettings, movement: MovementRules, playerView = false): ViewAtlasStore {
  rules.settings = settings;
  rules.movement = movement;
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `ranges-mode-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'measure', isMapLoading: false, isGMView: true });
  render(<ViewStoreProvider store={store}><MeasureToolBar playerView={playerView} /></ViewStoreProvider>);
  return store;
}

const modes = (): string[] => within(screen.getByRole('toolbar', { name: 'Measure modes' })).getAllByRole('button').map((item) => item.textContent ?? '');
const ranges = (): HTMLElement => screen.getByRole('button', { name: 'Ranges' });
const inert = (): boolean => ranges().getAttribute('aria-disabled') === 'true';

describe('the Ranges mode in the measure tool\'s bar', () => {
  it.each([
    ['range bands', BANDED, NO_MOVEMENT_RULES],
    ['movement steps', FEET, MOVES],
  ])('is the last mode and can be chosen on a map with %s', (_case, settings, movement) => {
    const store = renderBar(settings, movement);
    expect(modes().at(-1)).toBe('Ranges');
    expect(inert()).toBe(false);
    fireEvent.click(ranges());
    expect(store.getState().measureTool.mode).toBe('ranges');
    expect(ranges().getAttribute('aria-pressed')).toBe('true');
  });

  it.each([
    ['neither bands nor steps', FEET, NO_MOVEMENT_RULES],
    ['bands that end nowhere', { ...BANDED, rangeBands: [{ name: 'Near', maxSquares: 3 }] }, MOVES],
  ])('stays in its place, disabled, on a map with %s', (_case, settings, movement) => {
    const store = renderBar(settings, movement);
    expect(modes().at(-1)).toBe('Ranges');
    expect(inert()).toBe(true);
    fireEvent.click(ranges());
    expect(store.getState().measureTool.mode).toBe('ruler');
  });

  it('takes no choice in the session view, and the tool leaves it there for its first mode', async () => {
    const store = renderBar(BANDED, NO_MOVEMENT_RULES);
    fireEvent.click(ranges());
    act(() => store.setState({ isGMView: false }));
    expect(inert()).toBe(true);
    await waitFor(() => expect(store.getState().measureTool.mode).toBe('ruler'));
    act(() => store.setState({ isGMView: true }));
    expect(inert()).toBe(false);
  });

  it('is not offered in the players\' view, which leaves it when it is the tool\'s mode', async () => {
    rules.settings = BANDED;
    const store = renderBar(BANDED, NO_MOVEMENT_RULES, true);
    expect(modes()).not.toContain('Ranges');
    act(() => store.getState().setMeasureTool({ mode: 'ranges' }));
    await waitFor(() => expect(store.getState().measureTool.mode).toBe('ruler'));
  });
});

describe('the measure tool\'s key', () => {
  it('steps to Ranges after the last shape and on to the first mode, and over Ranges where it cannot be chosen', () => {
    const lastShape = MEASURE_MODES.at(-2)!.value;
    expect(nextMeasureMode(lastShape)).toBe('ranges');
    expect(nextMeasureMode('ranges')).toBe('ruler');
    expect(nextMeasureMode(lastShape, false)).toBe('ruler');
    expect(nextMeasureMode('ranges', false)).toBe('ruler');
    expect(nextMeasureMode('ruler', false)).toBe(nextMeasureMode('ruler'));
  });
});
