// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureRenderer } from '../../src/app/pixi/measure/MeasureRenderer';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { measuresPicture } from '../../src/app/pixi/picture/viewPictureParts';
import { AssetService } from '../../src/app/services/AssetService';
import type { MeasurePlayersView } from '../../src/app/pixi/measurePartsVisibility';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import { LIGHTING_PEEK_EVENT } from '../../src/app/lighting/lightingPeek';
import { SEES_ALL } from '../../src/app/vision/sight';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import { bareMapView } from '../helpers/bareMapView';
import { playersFrame, picturesOf, scenePicture } from '../helpers/pictures';
import { FRAME } from '../mocks/playerFrameSource';

// The view's lighting draws with WebGL: a scene lighting that sees all stands in for it.
vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => ({
    modeLayer: { visible: false },
    isEnabled: () => deps.store.getState().lighting.enabled,
    currentSight: () => SEES_ALL,
    sightIsCurrent: () => true,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: () => undefined,
    resetExplored: () => undefined,
    editExplored: () => false,
    beforeMapUnload: () => undefined,
    renderForFrame: (_frame, render) => render(),
    destroy: () => undefined,
  }),
}));

const afterTest: Array<() => void> = [];
afterEach(() => {
  afterTest.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

/** A view's captures with its measurements alone, whose one part shows by whether the players see the goblin. */
function harness(options: { tokens?: boolean } = {}) {
  const part = { visible: true };
  const sight = (id: string): 'seen' | 'unseen' => (id === 'hero' ? 'seen' : 'unseen');
  const seenInFrame = (id: string): boolean => id === 'hero';
  const playersSeeInFrame = vi.fn(() => seenInFrame);
  const getPlayerViewLayers = vi.fn((seen: (id: string) => boolean): LayerVisibility[] => [{ layer: part, visible: seen('goblin') }]);
  const measures = measuresPicture(
    { getPlayerViewLayers, getGmViewLayers: (): LayerVisibility[] => [{ layer: part, visible: true }], effects: { stillFor: () => () => undefined } },
    () => (options.tokens === false ? undefined : { playersSeeInFrame }),
  );
  return { measures, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers };
}

describe('a players\' frame and the measurements', () => {
  it('asks once per capture which tokens the players see, by the frame\'s sight, and hides measurements by it', () => {
    const { measures, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers } = harness();
    const during: boolean[] = [];
    picturesOf({ measures }).capture(playersFrame(FRAME, { sight }), () => during.push(part.visible));
    expect(playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(playersSeeInFrame).toHaveBeenCalledWith(sight);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(seenInFrame);
    expect(during).toEqual([false]);
    expect(part.visible).toBe(true);
  });

  it('sees no token while there is no token renderer, so no measurement from one shows', () => {
    const { measures, getPlayerViewLayers } = harness({ tokens: false });
    picturesOf({ measures }).capture(playersFrame(FRAME), () => undefined);
    const seen = getPlayerViewLayers.mock.calls[0]?.[0] as (id: string) => boolean;
    expect(['hero', 'goblin'].map(seen)).toEqual([false, false]);
  });

  it('keeps the measurements as the GM sees them in a picture of the scene', () => {
    const { measures, part } = harness();
    part.visible = false;
    expect(scenePicture({ measures }, { x: 0, y: 0, resolution: 1 }, () => part.visible)).toBe(true);
    expect(part.visible).toBe(false);
  });
});

const ASSET_INDEX = 'atlas-vtt/.atlas-data/assets-metadata.json';
const DUNGEON_MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const DUNGEON_INDEX = { collections: { dungeon: { id: 'dungeon', name: 'Dungeon', description: '', tags: {}, createdAt: 1, modifiedAt: 1 } }, assets: {}, version: 2 };

describe('the measure renderer\'s wiring', () => {
  /**
   * A view whose grid is built before it opens: opening builds the measure renderer again and wires
   * it a second time, which must stop what the first wiring follows.
   */
  async function rewiredView(): Promise<{ view: Awaited<ReturnType<typeof bareMapView>>; renderers: () => readonly unknown[] }> {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const restoreGraphics = stubJsdomGraphics();
    const built = vi.spyOn(MeasureRenderer.prototype, 'followShown');
    const view = await bareMapView({ grid: { size: 70, enabled: true, color: 0xffffff }, vault: { files: { [ASSET_INDEX]: JSON.stringify(DUNGEON_INDEX) } } });
    await view.renderer.init(document.createElement('div'));
    afterTest.push(() => {
      view.destroy();
      restoreGraphics();
      vi.unstubAllGlobals();
    });
    return { view, renderers: () => built.mock.contexts };
  }

  it('follows the tokens\' heights, the view\'s leaving and whom the canvas is drawn for with the measure renderer it has now', async () => {
    const rulesChanged = vi.spyOn(MeasureRenderer.prototype, 'rulesChanged');
    const left = vi.spyOn(MeasureRenderer.prototype, 'leave');
    const players = vi.spyOn(MeasureRenderer.prototype, 'playersView', 'set');
    const { view, renderers } = await rewiredView();
    const [first, current] = renderers();
    expect(renderers()).toHaveLength(2);
    expect(current).not.toBe(first);
    // Once the asset index is read, the map below is the dungeon collection's
    await vi.waitFor(() => expect(AssetService.getInstance(view.obsidian).getCollectionForMap(DUNGEON_MAP)).toBe('dungeon'));
    rulesChanged.mockClear();

    // A token off the floor: the rulers of the measure renderer the view has now are written again, once
    view.store.getState().addTokens([{ id: 'flier', kind: 'token', imagePath: '', size: 1, x: 100, y: 100, elevation: 30 } as never]);
    expect(rulesChanged).toHaveBeenCalledTimes(1);
    expect(rulesChanged.mock.contexts).toEqual([current]);

    // The map's collection changes its rules: again only that renderer, once
    rulesChanged.mockClear();
    view.store.setState({ mapPath: DUNGEON_MAP });
    // As the workspace tells every listener it was given, the first wiring's included
    for (const [name, listener] of vi.mocked(view.obsidian.workspace.on).mock.calls) {
      if (name === 'atlas-vtt:collection-settings-changed') (listener as (collectionId: string) => void)('dungeon');
    }
    expect(rulesChanged).toHaveBeenCalledTimes(1);
    expect(rulesChanged.mock.contexts).toEqual([current]);

    // Leaving the view is heard once, by that renderer
    view.events.emit('map-unloading');
    expect(left).toHaveBeenCalledTimes(1);
    expect(left.mock.contexts).toEqual([current]);

    // Whom the canvas is drawn for: nobody's sight while the GM looks, the players' while the GM peeks
    const playersView = players.mock.lastCall?.[0] as MeasurePlayersView;
    const heard = vi.fn();
    playersView.onChange(heard);
    expect(playersView.seenOnCanvas()).toBeNull();
    view.events.emit(LIGHTING_PEEK_EVENT, true);
    expect(heard).toHaveBeenCalled();
    expect(playersView.seenOnCanvas()).not.toBeNull();
  });
});

describe('measurePlayersView', () => {
  const store = {
    getState: () => ({
      objects: { tokens: { goblin: { id: 'goblin', kind: 'token', imagePath: '', x: 100, y: 100, size: 1, isHidden: true } } },
      tokenSettings: { tokenRingSize: 1.5 },
    }),
  } as never;

  it('places every token at its sprite and ring size, and asks the tokens\' sight only when called', () => {
    const lighting = vi.fn(() => undefined);
    const seenOnCanvas = (): boolean => true;
    const tokens = {
      getTokenSprites: () => ({ goblin: { x: 120, y: 100 } }),
      playersSeeInFrame: vi.fn(() => () => false),
    };
    const audience = { seenOnCanvas: vi.fn(() => seenOnCanvas), onChange: () => () => undefined };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => tokens as never, lighting, audience });
    expect(lighting).not.toHaveBeenCalled();
    const radius = (computeTokenPixelSize(70, 1) / 2) * 1.5;
    expect(view.footprints()).toEqual([{ id: 'goblin', x: 120, y: 100, radius }, { id: 'goblin', x: 100, y: 100, radius }]);
    view.seenAtStart();
    expect(lighting).toHaveBeenCalledTimes(1);
    expect(tokens.playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(view.seenOnCanvas()).toBe(seenOnCanvas);
  });

  it('fails closed without a token renderer: nothing seen in a frame', () => {
    const audience = { seenOnCanvas: () => null, onChange: () => () => undefined };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => undefined, lighting: () => undefined, audience });
    expect(view.seenAtStart()('goblin')).toBe(false);
  });
});
