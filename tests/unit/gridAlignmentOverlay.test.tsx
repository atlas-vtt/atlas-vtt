import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type { AlignmentResult } from '../../src/app/pixi/gridAlignmentMath';
import type { MapGray } from '../../src/app/pixi/gridDetection/detectGrid';
import { NO_STRETCH, readMapStretch, type MapStretch } from '../../src/app/grid/mapStretch';
import type { GridState } from '../../src/app/types/gridTypes';
import type { AtlasView } from '../../src/app/atlas-view';
import type { AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';

const detectGridFromMapImage = vi.fn<() => Promise<AlignmentResult | null>>();
const snapGridToMapGray = vi.fn<(gray: MapGray, candidates: AlignmentResult[]) => AlignmentResult | null>();
vi.mock('../../src/app/pixi/gridDetection/detectGrid', () => ({
  detectGridFromMapImage: () => detectGridFromMapImage(),
  readMapGray: () => Promise.resolve({ image: { width: 1, height: 1, data: new Float32Array(1) }, size: { width: 1000, height: 1000 } }),
  snapGridToMapGray: (gray: MapGray, candidates: AlignmentResult[]) => snapGridToMapGray(gray, candidates),
}));

import { GridAlignmentOverlay } from '../../src/app/react/components/GridAlignmentOverlay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';

const SCENE_GRID: GridState = { enabled: true, visible: false, type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

type Move = (point: { x: number; y: number }) => { x: number; y: number };

interface SceneStore {
  grid: GridState | null;
  mapPath: string;
  isMapLoading: boolean;
  /** Where the alignment that was applied took a point of the map; null where the map stayed as it was. */
  moved: { x: number; y: number } | null;
  setGrid: (grid: GridState) => void;
  alignGrid: (grid: GridState, move?: Move) => void;
}

interface Harness {
  store: ReturnType<typeof create<SceneStore>>;
  gridSystem: { updateOptions: ReturnType<typeof vi.fn>; setAlignmentMode: ReturnType<typeof vi.fn> };
  stretches: MapStretch[];
  canvas: HTMLCanvasElement;
  onClose: ReturnType<typeof vi.fn>;
}

/** The alignment panel over a 1000 × 1000 map whose canvas shows the world one to one from its corner. */
function open(grid: GridState = SCENE_GRID): Harness {
  const store = create<SceneStore>((set) => ({
    grid,
    mapPath: 'scene.atlasmap',
    isMapLoading: false,
    moved: null,
    setGrid: (next) => set({ grid: next }),
    alignGrid: (next, move) => set({ grid: next, moved: move ? move({ x: 100, y: 200 }) : null }),
  }));
  const stretches: MapStretch[] = [];
  let stretch = readMapStretch(grid.mapStretch);
  const mapImage = {
    get worldRect() { return { x: 0, y: 0, width: 1000 * stretch.x, height: 1000 * stretch.y }; },
    imageSize: { width: 1000, height: 1000 },
    get mapStretch() { return stretch; },
    setStretch: (next: MapStretch) => { stretch = next; stretches.push(next); },
    overview: () => Promise.resolve(null),
  };
  const canvas = document.body.createEl('canvas');
  const gridSystem = { updateOptions: vi.fn(), setAlignmentMode: vi.fn() };
  const viewport = { toWorld: (x: number, y: number) => ({ x, y }), scale: { x: 1, set: vi.fn() }, moveCenter: vi.fn(), addChild: vi.fn(), on: vi.fn(), off: vi.fn() };
  const renderer = {
    getViewportInstance: () => viewport,
    getGridSystem: () => gridSystem,
    getCanvasElement: () => canvas,
    getMapImage: () => mapImage,
    cancelGridAlignment: () => mapImage.setStretch(readMapStretch(store.getState().grid?.mapStretch)),
    applyGridAlignment: vi.fn(),
  };
  const view = { atlasStore: store, renderer } as unknown as AtlasView;
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ view } as AtlasUIContextValue}>
      <GridAlignmentOverlay onClose={onClose} />
    </AtlasUIContext.Provider>,
  );
  return { store, gridSystem, stretches, canvas, onClose };
}

/** A short left click on the map at a world point. */
function clickMap(canvas: HTMLCanvasElement, x: number, y: number): void {
  act(() => {
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  });
}

const lastPreview = (gridSystem: Harness['gridSystem']): unknown => gridSystem.updateOptions.mock.calls.at(-1)?.[0];

beforeEach(() => {
  detectGridFromMapImage.mockReset();
  snapGridToMapGray.mockReset();
});

afterEach(() => {
  cleanup();
  document.body.empty();
});

describe('GridAlignmentOverlay', () => {
  it('previews a detected grid on the map as it stretches it, and applies both together', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-horizontal', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
    const { store, gridSystem, stretches, onClose } = open();

    fireEvent.click(screen.getByText('Auto-detect from map image'));
    await screen.findByText('The map is drawn 4.8% wider, so that its cells are regular.');

    expect(stretches.at(-1)).toEqual({ x: 1.048, y: 1 });
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'hex-horizontal', size: 35.3, offsetX: 4, offsetY: 9, isAligning: true });
    // A detected grid is a preview like any other: nothing asks for a measurement, and the arrow keys nudge it.
    expect(screen.queryByText(/Click a hex corner/)).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(lastPreview(gridSystem)).toMatchObject({ offsetX: 5, offsetY: 9 });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    // The panel's grid type is the detected one from here on.
    expect(screen.getByRole('radio', { name: /Flat/ }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByText('Apply'));

    expect(store.getState().grid).toMatchObject({ type: 'hex-horizontal', size: 35.3, offsetX: 4, offsetY: 9, visible: true, mapStretch: { x: 1.048, y: 1 } });
    // What stands on the map goes with it: a point keeps its place on the image.
    expect(store.getState().moved!.x).toBeCloseTo(104.8, 6);
    expect(store.getState().moved!.y).toBeCloseTo(200, 6);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves nothing where the applied alignment draws the map as the scene has it', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 3, offsetY: 5, confidence: 0.9 });
    const { store } = open();
    fireEvent.click(screen.getByText('Auto-detect from map image'));
    await screen.findByText(/Grid: squares, 64/);

    fireEvent.click(screen.getByText('Apply'));

    expect(store.getState().grid).toMatchObject({ type: 'square', size: 64 });
    expect(store.getState().moved).toBeNull();
  });

  it('ends the alignment when the view opens another scene, with the map put back', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 0, offsetY: 0, confidence: 0.6, mapStretch: { x: 1, y: 1.1 } });
    const { store, stretches, onClose } = open();
    fireEvent.click(screen.getByText('Auto-detect from map image'));
    await screen.findByText('The map is drawn 10.0% taller, so that its cells are regular.');

    act(() => store.setState({ isMapLoading: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    expect(store.getState().grid).toBe(SCENE_GRID);
  });

  it('shows nothing of a detection that answers after the GM went on by hand', async () => {
    let answer: (found: unknown) => void = () => undefined;
    detectGridFromMapImage.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { stretches } = open();
    fireEvent.click(screen.getByText('Auto-detect from map image'));

    fireEvent.click(screen.getByText('Reset'));
    await act(async () => {
      answer({ gridType: 'hex-horizontal', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
      await Promise.resolve();
    });

    expect(screen.queryByText(/The map is drawn/)).toBeNull();
    expect(stretches.every((stretch) => stretch.x === 1 && stretch.y === 1)).toBe(true);
    expect(screen.getByRole('radio', { name: /Pointy/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByText('Auto-detect from map image').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('puts the map back as the scene has it when a previewed stretch is cancelled', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'square', cellSize: 64, offsetX: 0, offsetY: 0, confidence: 0.6, mapStretch: { x: 1, y: 1.1 } });
    const { store, stretches } = open();
    fireEvent.click(screen.getByText('Auto-detect from map image'));
    await screen.findByText('The map is drawn 10.0% taller, so that its cells are regular.');

    fireEvent.click(screen.getByText('Cancel'));

    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    expect(store.getState().grid).toBe(SCENE_GRID);
  });

  it('goes back from a detected grid to measuring when a tab is chosen', async () => {
    detectGridFromMapImage.mockResolvedValue({ gridType: 'hex-vertical', cellSize: 35.3, offsetX: 4, offsetY: 9, confidence: 0.51, mapStretch: { x: 1.048, y: 1 } });
    const { stretches } = open();
    fireEvent.click(screen.getByText('Auto-detect from map image'));
    await screen.findByText('The map is drawn 4.8% wider, so that its cells are regular.');

    fireEvent.click(screen.getByText('Measure'));

    await screen.findByText('Click a hex corner in the top-left area.');
    expect(stretches.at(-1)).toEqual(NO_STRETCH);
    expect((screen.getByText('Apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('fits one measurement to the map\'s lines: the chosen grid type first, the lines\' answer previewed', async () => {
    snapGridToMapGray.mockReturnValue({ gridType: 'hex-vertical', cellSize: 35.37, offsetX: 1, offsetY: 2, confidence: 0.5, mapStretch: { x: 1.048, y: 1 } });
    const { store, gridSystem, canvas } = open();

    // The corners to the left and right of a pointy hex 34 px wide: once read as the edge of a huge flat hex.
    clickMap(canvas, 100, 100);
    clickMap(canvas, 134, 100);

    await screen.findByText("Fitted to the map's lines (50% of the grid found on the map).");
    const candidates = snapGridToMapGray.mock.calls[0]![1];
    expect(candidates[0]).toMatchObject({ gridType: 'hex-vertical', cellSize: 34 });
    expect(candidates.map((c) => c.gridType)).toContain('hex-horizontal');
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'hex-vertical', size: 35.37 });

    fireEvent.click(screen.getByText('Apply'));
    expect(store.getState().grid).toMatchObject({ type: 'hex-vertical', size: 35.37, mapStretch: { x: 1.048, y: 1 } });
  });

  it('keeps the grid as measured where the lines answer nothing, after all four measurements', async () => {
    snapGridToMapGray.mockReturnValue(null);
    const { gridSystem, canvas } = open({ ...SCENE_GRID, type: 'square' });

    for (const [x, y] of [[100, 100], [600, 100], [100, 600], [600, 600]]) {
      clickMap(canvas, x!, y!);
      clickMap(canvas, x! + 50, y! + 3);
      // The lines are asked after the first measurement; the next waits for their answer.
      await waitFor(() => expect(screen.queryByText("Fitting to the map's lines…")).toBeNull());
    }

    await screen.findByText("The map's lines gave no match: this is the grid as you set it.");
    expect(snapGridToMapGray).toHaveBeenCalledTimes(2);
    expect(lastPreview(gridSystem)).toMatchObject({ type: 'square', size: 50, offsetX: 0, offsetY: 0 });
  });

  it('measures by hand alone with fitting switched off, in the grid type picked in the panel', async () => {
    const { gridSystem, canvas } = open();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('radio', { name: /Square/ }));

    for (const [x, y] of [[100, 100], [600, 100], [100, 600], [600, 600]]) {
      clickMap(canvas, x!, y!);
      clickMap(canvas, x! + 50, y!);
    }

    await waitFor(() => expect(lastPreview(gridSystem)).toMatchObject({ type: 'square', size: 50 }));
    expect(snapGridToMapGray).not.toHaveBeenCalled();
    expect(screen.queryByText("The map's lines gave no match: this is the grid as you set it.")).toBeNull();
  });
});
