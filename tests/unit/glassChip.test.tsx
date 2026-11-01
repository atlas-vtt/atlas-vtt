// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import type { AtlasView } from '../../src/app/atlas-view';
import type { GridState } from '../../src/app/types/gridTypes';
import type { WorldFrame } from '../../src/app/types/playerFrame';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import { createPlayerFramesActions, type PlayerFramesSlice, type SavedPlayerFrame } from '../../src/app/stores/playerFramesSlice';

interface FakeOutline {
  setGlass: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setSaved: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const fakes = vi.hoisted(() => ({
  outlines: [] as FakeOutline[],
  service: null as unknown,
  presentTab: vi.fn(),
}));

vi.mock('../../src/app/pixi/glassOutline', () => ({
  GlassOutline: class {
    saved: WorldFrame[] = [];
    setGlass = vi.fn();
    setOrigin = vi.fn();
    setSaved = vi.fn((frames: WorldFrame[]) => { this.saved = frames; });
    redraw = vi.fn();
    destroy = vi.fn();
    screenRect = (frame: WorldFrame) => ({ x: frame.centerX - frame.width / 2, y: frame.centerY - frame.height / 2, width: frame.width, height: frame.height });
    savedRect = (index: number) => (this.saved[index] ? this.screenRect(this.saved[index]) : undefined);
    savedAt = (x: number, y: number): number => {
      for (let index = this.saved.length - 1; index >= 0; index--) {
        const { x: left, y: top, width, height } = this.screenRect(this.saved[index]!);
        if (x >= left && x <= left + width && y >= top && y <= top + height) return index;
      }
      return -1;
    };
    constructor() {
      fakes.outlines.push(this);
    }
  },
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: { getInstance: () => fakes.service } }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab: fakes.presentTab, frameSourceOf: () => ({}) }));

import { GlassChip } from '../../src/app/packages/components/true-scale/GlassChip';
import { chipPlace } from '../../src/app/packages/components/true-scale/glassState';

/** Stands in for the player window: players see `shownTabId` through a glass 200 × 100 around (100, 100), following unless pinned. */
function fakeService() {
  const listeners = new Set<() => void>();
  const changed = (): void => listeners.forEach((listener) => listener());
  let glass: WorldFrame = { centerX: 100, centerY: 100, width: 200, height: 100 };
  const state = { frozen: false };
  const service = {
    state,
    isWindowOpen: () => true,
    glassOf: (tabId: string) => (playerWindowStore.getState().shownTabId === tabId ? glass : null),
    isFrozen: () => state.frozen,
    dragPlayersTo: vi.fn((_tabId: string, x: number, y: number) => {
      state.frozen = true;
      glass = { ...glass, centerX: x, centerY: y };
      changed();
      return true;
    }),
    framePlayersOn: vi.fn(() => true),
    playersToCamera: vi.fn((tabId: string) => playerWindowStore.getState().shownTabId === tabId),
    isTrueScale: () => false,
    playerCameraAt: vi.fn((x: number, y: number) => ({ centerX: x, centerY: y, scale: 1 })),
    freezeCamera: vi.fn(() => {
      state.frozen = true;
      changed();
    }),
    toggleCameraFreeze: vi.fn(() => {
      state.frozen = !state.frozen;
      changed();
      return state.frozen;
    }),
    unfreezeCamera: vi.fn(() => {
      state.frozen = false;
      changed();
    }),
    onPlayersCameraChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    playerViewWorldSize: vi.fn(() => ({ width: 200, height: 100 })),
  };
  return service;
}

const SQUARE: GridState = { enabled: true, type: 'square', size: 50, offsetX: 0, offsetY: 0, opacity: 1 };

type FakeMapState = { grid: GridState; mapLoaded: boolean; playerFrames: SavedPlayerFrame[] } & PlayerFramesSlice;

/** A map view whose screen is its world (zoom 1, no pan), centred on (500, 400), showing `tab-a`, its canvas in the document. */
function fakeView(grid: GridState = SQUARE, playerFrames: SavedPlayerFrame[] = []): AtlasView {
  const viewport = Object.assign(new EventEmitter(), {
    x: 0, y: 0, scale: { x: 1 }, screenWidth: 1000, screenHeight: 800,
    center: { x: 500, y: 400 },
    toWorld: (x: number, y: number) => ({ x, y }),
  });
  const canvas = document.body.appendChild(document.createElement('div')).appendChild(document.createElement('canvas'));
  const app = { canvas, ticker: { add: vi.fn(), remove: vi.fn() } };
  return {
    app: { workspace: { on: vi.fn(() => ({})), offref: vi.fn() } },
    serviceManager: { getRendererService: () => ({ getApp: () => app, getViewport: () => viewport, getRenderer: () => ({ addDmScreenOverlay: () => vi.fn() }) }) },
    tabMetaStore: createStore(() => ({ activeTabId: 'tab-a' })),
    atlasStore: createStore<FakeMapState>()(immer((set) => ({ grid, mapLoaded: true, playerFrames, ...createPlayerFramesActions(set) }))),
  } as unknown as AtlasView;
}

let service: ReturnType<typeof fakeService>;

beforeEach(() => {
  // jsdom has no PointerEvent: a mouse event of that type, with the pointer's id
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  service = fakeService();
  fakes.service = service;
  fakes.outlines.length = 0;
  fakes.presentTab.mockClear();
  playerWindowStore.setState({ isOpen: true, shownTabId: 'tab-a' });
});
afterEach(async () => {
  cleanup();
  document.body.replaceChildren();
  // The click a drag's release swallows is waited for until the next task
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
  resetPlayerWindowStore();
});

/** Presses the chip at (100, 50), drags it through `to` and lets go, or keeps holding with `release: false`. */
function drag(to: { x: number; y: number; altKey?: boolean }[], release = true): void {
  const chip = screen.getByText(/Players|Bring players here/).parentElement!;
  fireEvent.pointerDown(chip, { pointerId: 1, button: 0, clientX: 100, clientY: 50 });
  for (const { x, y, altKey = false } of to) fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y, altKey });
  if (release) fireEvent.pointerUp(window, { pointerId: 1, clientX: to.at(-1)!.x, clientY: to.at(-1)!.y });
}

describe('the glass chip', () => {
  it('is not there while the player window is closed', () => {
    playerWindowStore.setState({ isOpen: false, shownTabId: null });
    render(<GlassChip view={fakeView()} />);
    expect(screen.queryByText(/Players/)).toBeNull();
    expect(fakes.outlines).toHaveLength(0);
  });

  it('names the live glass following the GM, and pins it where it is', () => {
    render(<GlassChip view={fakeView()} />);
    expect(screen.getByText('Players · following you')).toBeTruthy();
    expect(fakes.outlines[0]!.setGlass).toHaveBeenLastCalledWith({ centerX: 100, centerY: 100, width: 200, height: 100 }, 'live');

    fireEvent.click(screen.getByRole('button', { name: 'Pin the players here' }));
    expect(service.freezeCamera).toHaveBeenCalledWith();
    expect(screen.getByText('Players')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Let the players follow you' }));
    // Silently: the notice of the command palette's freeze is not the chip's
    expect(service.unfreezeCamera).toHaveBeenCalledOnce();
    expect(service.toggleCameraFreeze).not.toHaveBeenCalled();
    expect(screen.getByText('Players · following you')).toBeTruthy();
  });

  it('drags the players with it, their top-left corner on the nearest grid intersection, and keeps the frame on release', () => {
    render(<GlassChip view={fakeView()} />);
    const outline = fakes.outlines[0]!;
    drag([{ x: 163, y: 72 }, { x: 190, y: 130 }]);

    // Grabbed 50 above its centre: (163, 122) puts the corner at (63, 72), which lands on (50, 50); (190, 180) on (100, 150)
    expect(service.dragPlayersTo.mock.calls).toEqual([['tab-a', 150, 100], ['tab-a', 200, 200]]);
    expect(service.framePlayersOn).toHaveBeenCalledWith('tab-a', 200, 200);
    expect(outline.setOrigin).toHaveBeenNthCalledWith(1, { centerX: 100, centerY: 100, width: 200, height: 100 });
    expect(outline.setOrigin).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Players')).toBeTruthy();
  });

  it('leaves the glass where it is dragged with Alt held, and on a hex grid', () => {
    render(<GlassChip view={fakeView()} />);
    drag([{ x: 163, y: 72, altKey: true }]);
    expect(service.framePlayersOn).toHaveBeenLastCalledWith('tab-a', 163, 122);
    cleanup();

    render(<GlassChip view={fakeView({ ...SQUARE, type: 'hex-vertical' })} />);
    drag([{ x: 163, y: 72 }]);
    expect(service.framePlayersOn).toHaveBeenLastCalledWith('tab-a', 163 + 63, 122 + 22);
  });

  it('does not drag below the threshold, so a press stays a click', () => {
    render(<GlassChip view={fakeView()} />);
    drag([{ x: 102, y: 51 }]);
    expect(service.dragPlayersTo).not.toHaveBeenCalled();
    expect(service.framePlayersOn).not.toHaveBeenCalled();
  });

  it('puts players back on Escape: following again, or pinned where they were', () => {
    render(<GlassChip view={fakeView()} />);
    drag([{ x: 163, y: 72 }], false);
    expect(service.state.frozen).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(service.unfreezeCamera).toHaveBeenCalledOnce();
    expect(service.toggleCameraFreeze).not.toHaveBeenCalled();
    expect(service.state.frozen).toBe(false);
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(service.framePlayersOn).not.toHaveBeenCalled();
    expect(fakes.outlines[0]!.setOrigin).toHaveBeenLastCalledWith(null);

    // The cancelled drag left the glass at (150, 100), where players are pinned now
    act(() => { service.freezeCamera(); });
    drag([{ x: 163, y: 72 }], false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(service.freezeCamera).toHaveBeenLastCalledWith({ centerX: 150, centerY: 100, scale: 1 });
    expect(service.framePlayersOn).not.toHaveBeenCalled();
  });

  describe('on a map players do not see', () => {
    beforeEach(() => {
      playerWindowStore.setState({ isOpen: true, shownTabId: 'tab-b' });
    });

    it('stands as a ghost in the middle of the view and brings players there', () => {
      render(<GlassChip view={fakeView()} />);
      expect(screen.getByText('Bring players here')).toBeTruthy();
      expect(fakes.outlines[0]!.setGlass).toHaveBeenLastCalledWith({ centerX: 500, centerY: 400, width: 200, height: 100 }, 'ghost');

      fireEvent.click(screen.getByRole('button', { name: 'Show players this map' }));
      expect(fakes.presentTab).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'tab-a', { camera: { centerX: 500, centerY: 400, scale: 1 } });
    });

    it('is dragged alone, stays where it was dropped, and presents the map there only from its button', async () => {
      render(<GlassChip view={fakeView()} />);
      drag([{ x: 163, y: 72 }]);
      // Grabbed at (100, 50), 400 left of and 350 above its centre: (563, 422) puts the corner at (463, 372), which lands on (450, 350)
      expect(service.dragPlayersTo).not.toHaveBeenCalled();
      expect(fakes.outlines[0]!.setGlass).toHaveBeenLastCalledWith({ centerX: 550, centerY: 400, width: 200, height: 100 }, 'ghost');
      expect(fakes.presentTab).not.toHaveBeenCalled();

      // The click a browser sends right after the drag's release is swallowed; a later press is not
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.click(screen.getByRole('button', { name: 'Show players this map' }));
      expect(fakes.presentTab).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'tab-a', { camera: { centerX: 550, centerY: 400, scale: 1 } });
    });

    it('is not there while players are held on another level of this tab', () => {
      playerWindowStore.setState({ shownTabId: 'tab-a' });
      service.glassOf = () => null;
      const { container } = render(<GlassChip view={fakeView()} />);
      expect(container.querySelector<HTMLElement>('.atlas-glass-chip')!.hidden).toBe(true);
      expect(fakes.outlines[0]!.setGlass).toHaveBeenLastCalledWith(null, undefined);
    });
  });
});

describe('saved frames', () => {
  const FRAME: SavedPlayerFrame = { centerX: 300, centerY: 300, width: 200, height: 100, scale: 2 };
  /** The view's map, holding `frames`. */
  const map = (view: AtlasView) => view.atlasStore as unknown as { getState(): FakeMapState };
  const hover = (view: AtlasView, x: number, y: number): void => {
    fireEvent.pointerMove(view.serviceManager!.getRendererService()!.getApp()!.canvas, { clientX: x, clientY: y });
  };
  const savedChip = (): HTMLElement | null => screen.queryByText(/^Frame \d+$/)?.parentElement ?? null;

  it('saves the frame players see, with their zoom, from the live glass only', () => {
    const view = fakeView();
    render(<GlassChip view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save this frame' }));
    expect(map(view).getState().playerFrames).toEqual([{ centerX: 100, centerY: 100, width: 200, height: 100, scale: 1 }]);
    expect(fakes.outlines[0]!.setSaved).toHaveBeenLastCalledWith([{ centerX: 100, centerY: 100, width: 200, height: 100 }]);
    cleanup();

    playerWindowStore.setState({ shownTabId: 'tab-b' });
    render(<GlassChip view={fakeView()} />);
    expect(screen.queryByRole('button', { name: 'Save this frame' })).toBeNull();
  });

  it('shows the chip of the frame under the pointer, the later one where they overlap, and lets it go 300 ms after the pointer left', () => {
    vi.useFakeTimers();
    try {
      const view = fakeView(SQUARE, [FRAME, { ...FRAME, centerX: 350 }]);
      render(<GlassChip view={view} />);
      expect(savedChip()!.hidden).toBe(true);

      hover(view, 220, 280);
      expect(screen.getByText('Frame 1')).toBeTruthy();
      expect(savedChip()!.hidden).toBe(false);
      expect(screen.getByRole('button', { name: 'Show players here' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
      hover(view, 300, 300);
      expect(screen.getByText('Frame 2')).toBeTruthy();

      // Out of the frames and onto the chip: it stays
      hover(view, 900, 700);
      fireEvent.pointerEnter(savedChip()!);
      act(() => { vi.advanceTimersByTime(1000); });
      expect(savedChip()!.hidden).toBe(false);

      fireEvent.pointerLeave(savedChip()!);
      act(() => { vi.advanceTimersByTime(299); });
      expect(savedChip()!.hidden).toBe(false);
      act(() => { vi.advanceTimersByTime(1); });
      expect(savedChip()!.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('comes up under no pan or drag on the map', () => {
    const view = fakeView(SQUARE, [FRAME]);
    render(<GlassChip view={view} />);
    fireEvent.pointerMove(view.serviceManager!.getRendererService()!.getApp()!.canvas, { clientX: 220, clientY: 280, buttons: 2 });
    expect(savedChip()!.hidden).toBe(true);
  });

  it('sends players there on the map they see, gliding through the saved camera', () => {
    const view = fakeView(SQUARE, [FRAME]);
    render(<GlassChip view={view} />);
    hover(view, 220, 280);
    fireEvent.click(screen.getByRole('button', { name: 'Show players here' }));
    expect(service.playersToCamera).toHaveBeenCalledWith('tab-a', FRAME);
    expect(fakes.presentTab).not.toHaveBeenCalled();
  });

  it('presents this map through the saved camera where players see another', () => {
    playerWindowStore.setState({ shownTabId: 'tab-b' });
    const view = fakeView(SQUARE, [FRAME]);
    render(<GlassChip view={view} />);
    hover(view, 220, 280);
    fireEvent.click(screen.getByRole('button', { name: 'Show players here' }));
    expect(fakes.presentTab).toHaveBeenCalledWith(expect.anything(), view, 'tab-a', { camera: FRAME });
  });

  it('removes the frame, and its chip goes', () => {
    const view = fakeView(SQUARE, [FRAME, { ...FRAME, centerX: 900 }]);
    render(<GlassChip view={view} />);
    hover(view, 220, 280);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(map(view).getState().playerFrames).toEqual([{ ...FRAME, centerX: 900 }]);
    expect(savedChip()!.hidden).toBe(true);
  });

  it('moves the frame where its chip is dragged, snapped like the glass, and writes it on release', () => {
    const view = fakeView(SQUARE, [FRAME]);
    render(<GlassChip view={view} />);
    hover(view, 220, 280);
    const outline = fakes.outlines[0]!;
    // Grabbed 90 left of and 40 above its centre: (262, 281) puts the corner at (252, 271), which lands on (250, 250)
    fireEvent.pointerDown(savedChip()!, { pointerId: 1, button: 0, clientX: 210, clientY: 260 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 262, clientY: 281 });
    expect(outline.setSaved).toHaveBeenLastCalledWith([{ centerX: 350, centerY: 300, width: 200, height: 100 }]);
    expect(map(view).getState().playerFrames[0]).toEqual(FRAME);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 262, clientY: 281 });
    expect(map(view).getState().playerFrames).toEqual([{ ...FRAME, centerX: 350 }]);
    expect(service.dragPlayersTo).not.toHaveBeenCalled();
  });

  it('puts a dragged frame back on Escape', () => {
    const view = fakeView(SQUARE, [FRAME]);
    render(<GlassChip view={view} />);
    hover(view, 220, 280);
    fireEvent.pointerDown(savedChip()!, { pointerId: 1, button: 0, clientX: 210, clientY: 260 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 262, clientY: 281 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fakes.outlines[0]!.setSaved).toHaveBeenLastCalledWith([{ centerX: 300, centerY: 300, width: 200, height: 100 }]);
    expect(map(view).getState().playerFrames).toEqual([FRAME]);
  });

  it('draws them at the size players see at true scale, around their own centre', () => {
    service.isTrueScale = () => true;
    service.playerViewWorldSize.mockReturnValue({ width: 120, height: 80 });
    render(<GlassChip view={fakeView(SQUARE, [FRAME])} />);
    expect(fakes.outlines[0]!.setSaved).toHaveBeenLastCalledWith([{ centerX: 300, centerY: 300, width: 120, height: 80 }]);
  });
});

describe('where the chip stands', () => {
  const room = { canvasX: 0, canvasY: 40, width: 800, height: 600, top: 48, bottom: 64 };

  it('sits centred on the glass top edge', () => {
    expect(chipPlace({ x: 100, y: 200, width: 400, height: 300 }, { width: 160, height: 48 }, room)).toEqual({ x: 220, y: 216 });
  });

  it('stays in the pane, clear of its bars, while a following glass is partly or wholly off screen', () => {
    expect(chipPlace({ x: -900, y: -500, width: 400, height: 300 }, { width: 160, height: 48 }, room)).toEqual({ x: 8, y: 56 });
    expect(chipPlace({ x: 2000, y: 2000, width: 400, height: 300 }, { width: 160, height: 48 }, room)).toEqual({ x: 632, y: 480 });
  });

  it('stays on a pinned glass and leaves the screen with it', () => {
    expect(chipPlace({ x: -900, y: -500, width: 400, height: 300 }, { width: 160, height: 48 }, room, false)).toEqual({ x: -780, y: -484 });
  });
});
