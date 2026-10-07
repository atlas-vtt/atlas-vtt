import { describe, expect, it, vi } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import { SEES_ALL, type Sight } from '../../../vision/sight';
import type { LightingUnavailable } from '../LightingRenderer';
import { LightingViewHost } from '../LightingViewHost';
import type { SceneLightingView } from '../sceneLightingView';

interface FakeView extends SceneLightingView {
  modeLayer: { visible: boolean };
  destroyed: boolean;
  /** How many pictures this view rendered. */
  pictures: number;
  /** What the view does before it renders a frame, such as an engine failing while it prepares it. */
  beforeFrame: () => void;
  /** Whether its sight is that of the scene the store holds. */
  current: boolean;
}

function fakeView(sight: Sight = SEES_ALL): FakeView {
  const view: FakeView = {
    modeLayer: { visible: false },
    destroyed: false,
    pictures: 0,
    beforeFrame: () => undefined,
    current: true,
    isEnabled: () => true,
    currentSight: () => sight,
    sightIsCurrent: () => view.current,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: vi.fn(),
    resetExplored: vi.fn(),
    editExplored: vi.fn(() => false),
    beforeMapUnload: vi.fn(),
    renderForFrame: (_frame, render) => {
      view.beforeFrame();
      const picture = render();
      view.pictures++;
      return picture;
    },
    destroy: () => { view.destroyed = true; },
  };
  return view;
}

const FALLBACK_SIGHT: Sight = { ...SEES_ALL, all: false };
const CAVE = 'maps/cave.atlasmap';
const CRYPT = 'maps/crypt.atlasmap';

interface Setup {
  host: LightingViewHost;
  engines: FakeView[];
  fallbacks: FakeView[];
  /** The latest engine view reports itself unavailable. */
  giveUp: (reason: LightingUnavailable) => void;
  switchLighting: (enabled: boolean) => void;
  /** The store writes and view calls of `MapService.loadMap`, in its order. */
  loadMap: (path: string) => void;
  forgetAttempt: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  onSightChange: ReturnType<typeof vi.fn>;
}

function setup(options: { canvasRenderer?: boolean; givesUpAtStart?: LightingUnavailable } = {}): Setup {
  const engines: FakeView[] = [];
  const fallbacks: FakeView[] = [];
  const reports: ((reason: LightingUnavailable) => void)[] = [];
  const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
  let state = { mapPath: CAVE, isMapLoading: false, lighting: { enabled: true, ambient: 1 } } as ViewAtlasState;
  const write = (patch: Partial<ViewAtlasState>): void => {
    const previous = state;
    state = { ...state, ...patch };
    // As zustand notifies: a listener removed by an earlier one in the round is not called.
    listeners.forEach((listener) => listener(state, previous));
  };
  const store = {
    getState: () => state,
    subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const forgetAttempt = vi.fn();
  const notify = vi.fn();
  const onSightChange = vi.fn();
  let startsBroken = options.givesUpAtStart;
  const host = new LightingViewHost({
    store,
    canvasRenderer: options.canvasRenderer ?? false,
    createEngineView: (onUnavailable) => {
      const view = fakeView();
      engines.push(view);
      reports.push(onUnavailable);
      if (startsBroken) onUnavailable(startsBroken);
      startsBroken = undefined;
      return view;
    },
    createFallback: () => {
      const view = fakeView(FALLBACK_SIGHT);
      fallbacks.push(view);
      return view;
    },
    forgetAttempt,
    notify,
    onSightChange,
  });
  return {
    host,
    engines,
    fallbacks,
    giveUp: (reason) => reports.at(-1)!(reason),
    switchLighting: (enabled) => write({ lighting: { ...state.lighting, enabled } }),
    loadMap: (path) => {
      host.beforeMapUnload(); // 'map-unloading'
      write({ isMapLoading: true }); // setMapLoading(true, 0)
      write({ mapPath: path }); // setMapPath
      write({ lighting: { enabled: false, ambient: 0.1 } }); // clearMapState
      host.refreshBounds(); // the map image is in
      write({ lighting: { enabled: true, ambient: 1 } }); // persist.rehydrate
      write({ isMapLoading: false }); // the loading screen goes
    },
    forgetAttempt,
    notify,
    onSightChange,
  };
}

describe('LightingViewHost', () => {
  it('lights with the engine on a GPU renderer, without a notice', () => {
    const { host, engines, fallbacks, notify } = setup();
    expect(engines).toHaveLength(1);
    expect(fallbacks).toHaveLength(0);
    expect(host.currentSight()).toBe(SEES_ALL);
    expect(notify).not.toHaveBeenCalled();
  });

  it('uses the fallback on the canvas renderer, which has its own notice', () => {
    const { host, engines, fallbacks, notify } = setup({ canvasRenderer: true });
    expect(engines).toHaveLength(0);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify).not.toHaveBeenCalled();
  });

  it('swaps to the fallback when the engine fails, tells the GM once and destroys the engine view', () => {
    const { host, engines, fallbacks, giveUp, forgetAttempt, notify } = setup();
    giveUp('failed');
    expect(engines[0]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify.mock.calls).toEqual([[false]]);
    // The failure was handled: no note of a crash is left for the next session.
    expect(forgetAttempt).toHaveBeenCalledOnce();
  });

  it('keeps the players\' view and its consumers working through the swap', () => {
    const { host, fallbacks, giveUp } = setup();
    const modeLayer = host.modeLayer;
    modeLayer.visible = true;

    giveUp('failed');

    expect(host.modeLayer).toBe(modeLayer);
    expect(fallbacks[0]!.modeLayer.visible).toBe(true);
    modeLayer.visible = false;
    expect(fallbacks[0]!.modeLayer.visible).toBe(false);
    host.refreshBounds();
    host.beforeMapUnload();
    expect(fallbacks[0]!.refreshBounds).toHaveBeenCalledOnce();
    expect(fallbacks[0]!.beforeMapUnload).toHaveBeenCalledOnce();
  });

  it('says whether its sight is the scene\'s as the view that draws says, also after a swap', () => {
    const { host, engines, giveUp } = setup();
    engines[0]!.current = false;
    expect(host.sightIsCurrent()).toBe(false);
    giveUp('failed');
    expect(host.sightIsCurrent()).toBe(true);
  });

  it('reports the sight of the view it swapped in, once that view answers for the host', () => {
    const { host, giveUp, onSightChange } = setup();
    const seen: Sight[] = [];
    onSightChange.mockImplementation(() => seen.push(host.currentSight()));
    giveUp('failed');
    expect(seen).toEqual([FALLBACK_SIGHT]);
  });

  it('stays on the fallback for the rest of the view after a failure, whatever the GM switches', () => {
    const { engines, fallbacks, giveUp, switchLighting, notify } = setup();
    giveUp('failed');
    switchLighting(false);
    switchLighting(true);
    expect(engines).toHaveLength(1);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]!.destroyed).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('starts on the fallback when the last attempt never finished, and keeps its note', () => {
    const { host, engines, fallbacks, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    expect(engines[0]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(1);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(notify.mock.calls).toEqual([[true]]);
    expect(forgetAttempt).not.toHaveBeenCalled();
  });

  it('forgets the unfinished attempt and brings the engine back when the GM switches lighting off', () => {
    const { host, engines, fallbacks, switchLighting, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    host.modeLayer.visible = true;

    switchLighting(false);

    expect(forgetAttempt).toHaveBeenCalledOnce();
    expect(engines).toHaveLength(2);
    expect(engines[1]!.destroyed).toBe(false);
    expect(engines[1]!.modeLayer.visible).toBe(true);
    expect(fallbacks[0]!.destroyed).toBe(true);
    expect(host.currentSight()).toBe(SEES_ALL);
    switchLighting(true);
    switchLighting(false);
    expect(engines).toHaveLength(2);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('falls back for good when the retried engine fails', () => {
    const { engines, fallbacks, giveUp, switchLighting, notify } = setup({ givesUpAtStart: 'unfinished' });
    switchLighting(false);
    switchLighting(true);
    giveUp('failed');
    expect(engines[1]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(2);
    expect(notify.mock.calls).toEqual([[true], [false]]);
    switchLighting(false);
    expect(engines).toHaveLength(2);
  });

  it('keeps its one engine view through map loads, which pass through lighting off', () => {
    const { engines, fallbacks, loadMap, forgetAttempt, notify } = setup();
    loadMap(CRYPT);
    loadMap(CAVE);
    loadMap(CAVE);
    expect(engines).toHaveLength(1);
    expect(engines[0]!.destroyed).toBe(false);
    expect(fallbacks).toHaveLength(0);
    expect(forgetAttempt).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not take a map load for the GM\'s retry: reloading the marked map keeps its note', () => {
    const { host, engines, fallbacks, giveUp, loadMap, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });

    loadMap(CAVE);

    // The engine is back to decide for the map that arrived, and nothing was forgotten.
    expect(forgetAttempt).not.toHaveBeenCalled();
    expect(engines).toHaveLength(2);
    expect(fallbacks[0]!.destroyed).toBe(true);
    // Its attempt on the marked map is refused again; the GM was told about this map already.
    giveUp('unfinished');
    expect(engines[1]!.destroyed).toBe(true);
    expect(fallbacks).toHaveLength(2);
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(forgetAttempt).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
  });

  it('lights another map loaded into a view that was held back, and tells the GM when that one is marked too', () => {
    const { host, engines, giveUp, loadMap, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    loadMap(CRYPT);
    expect(engines).toHaveLength(2);
    expect(host.currentSight()).toBe(SEES_ALL);
    expect(notify).toHaveBeenCalledOnce();

    giveUp('unfinished');
    expect(notify.mock.calls).toEqual([[true], [true]]);
    expect(forgetAttempt).not.toHaveBeenCalled();
  });

  it('still retries for the GM after a load: off forgets the note, and the next refusal is told again', () => {
    const { engines, giveUp, loadMap, switchLighting, forgetAttempt, notify } = setup({ givesUpAtStart: 'unfinished' });
    loadMap(CAVE);
    giveUp('unfinished');

    switchLighting(false);
    expect(forgetAttempt).toHaveBeenCalledOnce();
    expect(engines).toHaveLength(3);
    switchLighting(true);
    giveUp('unfinished');
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not let a view that cannot be torn down throw into the store or the ticker', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, engines, giveUp } = setup();
    engines[0]!.destroy = (): void => {
      throw new TypeError('the world was dropped halfway');
    };
    expect(() => giveUp('failed')).not.toThrow();
    expect(host.currentSight()).toBe(FALLBACK_SIGHT);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('destroys whichever view it holds, and stops listening', () => {
    const { host, engines, fallbacks, giveUp, switchLighting } = setup({ givesUpAtStart: 'unfinished' });
    host.destroy();
    expect(fallbacks[0]!.destroyed).toBe(true);
    switchLighting(false);
    expect(engines).toHaveLength(1);
    expect(() => giveUp('failed')).not.toThrow();
    expect(fallbacks).toHaveLength(1);
  });

  it('renders a frame through the view that lights the map', () => {
    const { host, engines, fallbacks } = setup();
    expect(host.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, () => 'picture')).toBe('picture');
    expect(engines[0]!.pictures).toBe(1);
    expect(fallbacks).toHaveLength(0);
  });

  it('takes the picture through the fallback when the engine fails while it prepares the frame', () => {
    const { host, engines, fallbacks, giveUp } = setup();
    host.modeLayer.visible = true;
    engines[0]!.beforeFrame = () => giveUp('failed');
    const render = vi.fn(() => 'picture');

    expect(host.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, render)).toBe('picture');
    // The fallback, which keeps the darkness of the players' view on the canvas out, rendered it, once.
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]!.pictures).toBe(1);
    expect(fallbacks[0]!.modeLayer.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
