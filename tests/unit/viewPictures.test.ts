// @vitest-environment jsdom
import { Container, type ContainerChild } from 'pixi.js';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { SceneLightingDeps } from '../../src/app/pixi/lighting/createSceneLighting';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { GmOverlays } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { SceneLightingView } from '../../src/app/pixi/lighting/sceneLightingView';
import { FloorGhost } from '../../src/app/pixi/levels/FloorGhost';
import { LiquidLayer } from '../../src/app/pixi/liquids/LiquidLayer';
import { AreaEffects } from '../../src/app/pixi/measure/effects/AreaEffects';
import { MeasureRenderer } from '../../src/app/pixi/measure/MeasureRenderer';
import { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { ViewRoofs } from '../../src/app/pixi/roofs/ViewRoofs';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import type { KeptMeasure } from '../../src/app/measure/measureTypes';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { TokenSeen } from '../../src/app/vision/measureOrigin';
import { NO_SIGHT, SEES_ALL } from '../../src/app/vision/sight';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import { frameView } from '../../src/app/services/playerFrameDemand';
import { bareMapView, type BareMapView } from '../helpers/bareMapView';

/** What the scene's lighting sees: nothing, or everything. */
const sight = vi.hoisted(() => ({ sees: false }));
/** The scene lighting's render of a picture of the scene, lit for that picture's frame. */
const sceneLit = vi.hoisted(() => vi.fn((_frame: unknown, render: () => unknown) => render()));
vi.mock('../../src/app/pixi/lighting/createSceneLighting', () => ({
  createSceneLighting: (deps: SceneLightingDeps): SceneLightingView => ({
    modeLayer: { visible: false },
    isEnabled: () => deps.store.getState().lighting.enabled,
    currentSight: () => (sight.sees ? SEES_ALL : NO_SIGHT),
    sightIsCurrent: () => true,
    lightReaches: () => [],
    ambientLight: () => ({ ambient: 1 }),
    refreshBounds: () => undefined,
    resetExplored: () => undefined,
    editExplored: () => false,
    beforeMapUnload: () => undefined,
    renderForFrame: <T,>(frame: SceneFrame, render: () => T): T => sceneLit(frame, render) as T,
    destroy: () => undefined,
  }),
}));

/** A players' frame through a camera of its own: another part of the map, at another zoom than the GM's. */
const FRAME: PlayerFrame = { width: 1280, height: 720, resolution: 1, antialias: false, centerX: 600, centerY: 400, scale: 2 };
const GM_CAMERA = { x: -30, y: 20, scale: 1.5 };
const LEVELS: SceneLevel[] = [{ id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.png' }, { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' }];

const token = (id: string, more: Partial<TokenEntity>): TokenEntity => ({ id, kind: 'token', imagePath: '', size: 1, x: 0, y: 0, ...more } as TokenEntity);
const ruler = (id: string, more: Partial<KeptMeasure>): KeptMeasure => ({ id, kind: 'measure', shape: 'ruler', points: [{ x: 100, y: 300 }, { x: 500, y: 300 }], ...more } as KeptMeasure);
const pen = (id: string): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', hidden: true, points: [{ x: 50, y: 500 }, { x: 400, y: 500 }], color: '#ffffff', width: 4, opacity: 1 });

type StageState = Array<[string, boolean, number, number, number, number, number]>;

function stageState(stage: Container): StageState {
  const state: StageState = [];
  const walk = (node: ContainerChild, path: string): void => {
    state.push([path, node.visible, node.alpha, node.position.x, node.position.y, node.scale.x, node.scale.y]);
    node.children.forEach((child, index) => walk(child, `${path}/${index}`));
  };
  walk(stage, 'stage');
  return state;
}

/** The last answer of a renderer's declaration of what a picture shows of its layers. */
const lastAnswer = <T,>(spy: MockInstance): T => spy.mock.results.at(-1)?.value as T;

/** The view, the touch gestures' ring, a tool preview on the GM's screen, a layer only the players' frame shows, and the renderers' declarations. */
interface Scene {
  view: BareMapView;
  ring: Container;
  overlay: Container;
  frameOnly: Container;
  spies: Record<'pinsFrame' | 'pinsPicture' | 'tokensFrame' | 'tokensPicture' | 'measuresFrame' | 'measuresPicture' | 'fogFrame' | 'fogPicture'
    | 'drawingsFrame' | 'drawingsPicture' | 'selection' | 'lightingFrame' | 'gmOverlays' | 'floorGhost'
    | 'mapImageView' | 'mapImagePoster' | 'roofView' | 'roofWhole' | 'liquidsStill' | 'effectsStill', MockInstance>;
}

async function scene(): Promise<Scene> {
  const spies: Scene['spies'] = {
    pinsFrame: vi.spyOn(PinRenderer.prototype, 'playerLayers'),
    pinsPicture: vi.spyOn(PinRenderer.prototype, 'pictureLayers'),
    tokensFrame: vi.spyOn(TokenRenderer.prototype, 'getPlayerViewLayers'),
    tokensPicture: vi.spyOn(TokenRenderer.prototype, 'getGmViewLayers'),
    measuresFrame: vi.spyOn(MeasureRenderer.prototype, 'getPlayerViewLayers'),
    measuresPicture: vi.spyOn(MeasureRenderer.prototype, 'getGmViewLayers'),
    fogFrame: vi.spyOn(FogOfWarRenderer.prototype, 'getPlayerViewLayers'),
    fogPicture: vi.spyOn(FogOfWarRenderer.prototype, 'getGmViewLayers'),
    drawingsFrame: vi.spyOn(AnnotationsRenderer.prototype, 'getPlayerViewLayers'),
    drawingsPicture: vi.spyOn(AnnotationsRenderer.prototype, 'getPictureLayers'),
    selection: vi.spyOn(SelectionManager.prototype, 'getPlayerViewLayers'),
    lightingFrame: vi.spyOn(LightingController.prototype, 'playerLayers'),
    gmOverlays: vi.spyOn(LightingController.prototype, 'gmOverlays'),
    floorGhost: vi.spyOn(FloorGhost.prototype, 'layer', 'get'),
    mapImageView: vi.spyOn(MosaicCanvas.prototype, 'drawFor'),
    mapImagePoster: vi.spyOn(MosaicCanvas.prototype, 'hideVideoFor'),
    roofView: vi.spyOn(ViewRoofs.prototype, 'drawFor'),
    roofWhole: vi.spyOn(ViewRoofs.prototype, 'renderForFrame'),
    liquidsStill: vi.spyOn(LiquidLayer.prototype, 'stillFor'),
    effectsStill: vi.spyOn(AreaEffects.prototype, 'stillFor'),
  };
  const ring = new Container({ label: 'touch-ring' });
  const view = await bareMapView({ whole: { gestures: { setHost: () => undefined, hiddenLayers: () => [{ layer: ring, visible: false }] } } });
  views.push(view);
  const { renderer, store, viewport } = view;
  viewport.addChild(ring);
  store.setState((state) => ({
    levels: LEVELS,
    viewedLevel: 'upper',
    lighting: { ...state.lighting, enabled: true, ambient: 1 },
  }));
  store.getState().addTokens([token('ghost', { x: 100, y: 100, isHidden: true }), token('goblin', { x: 300, y: 200 })]);
  store.setState((state) => ({
    objects: {
      ...state.objects,
      measures: {
        private: ruler('private', { hidden: true, level: 'upper' }),
        goblins: ruler('goblins', { level: 'upper', points: [{ x: 300, y: 200 }, { x: 500, y: 200 }], origin: { tokenIds: ['goblin'], unseenAtStart: false } }),
      },
      drawings: { secret: { ...pen('secret'), level: 'upper' } as DrawingStroke },
    },
  }));
  store.getState().addNotePin(400, 100, 'note.md');
  store.getState().setSelection(['goblin']);
  renderer.getTokenPlacer();
  renderer.showFloorGhost('ground');
  const overlay = new Container();
  renderer.addDmScreenOverlay(overlay);
  const frameOnly = new Container();
  renderer.addPlayerFrameLayer(frameOnly);
  await expect.poll(() => ['ghost', 'goblin'].every((id) => renderer.getTokenRenderer()?.getTokenSprites()[id] instanceof Container)).toBe(true);
  viewport.position.set(GM_CAMERA.x, GM_CAMERA.y);
  viewport.scale.set(GM_CAMERA.scale);
  // The first capture builds what only captures draw (the pins the players see); from then on a capture changes nothing.
  renderer.withPlayerSafeFrame(() => undefined, DEFAULT_SETTINGS.localPlayerView, FRAME);
  view.render.mockClear();
  return { view, ring, overlay, frameOnly, spies };
}

/** Every layer `answers` names has the visibility (and opacity) it names now. */
function applied(answers: readonly LayerVisibility[]): boolean {
  return answers.length > 0 && answers.every(({ layer, visible, alpha }) => layer.visible === visible && (alpha === undefined || layer.alpha === alpha));
}

const views: BareMapView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  vi.restoreAllMocks();
  sight.sees = false;
});

/**
 * The view's own captures, with every part it attaches where it builds it, on a lit scene of two
 * floors. The committed twin of the pull request's equivalence harness: on the base the same layers
 * were hidden and shown by the orchestrator's `playerFrameLayers`, `pictureLayers` and `gmMarkLayers`,
 * and this test held there too. Leaving out any part's `attach` makes it fail.
 */
describe('the pictures of a map view as Atlas builds it', () => {
  it('renders the players\' frame through its own camera, with each part as its row says, and the GM\'s again after it', async () => {
    const { view, ring, overlay, frameOnly, spies } = await scene();
    const { renderer, store, viewport, render } = view;
    const goblin = renderer.getTokenRenderer()!.getTokenSprites().goblin!;
    const ghost = renderer.getTokenRenderer()!.getTokenSprites().ghost!;
    const placer = renderer.getTokenPlacer()!;
    const before = stageState(viewport.parent!);
    let during: Record<string, unknown> | null = null;
    renderer.withPlayerSafeFrame(() => {
      const overlays = lastAnswer<GmOverlays>(spies.gmOverlays);
      during = {
        camera: [viewport.position.x, viewport.position.y, viewport.scale.x],
        // Hidden, and out of the lighting's sight though not hidden
        ghost: ghost.visible,
        goblin: goblin.visible,
        tokensBySight: (spies.tokensFrame.mock.lastCall?.[1] as TokenPerception | undefined)?.('goblin'),
        measuresBySight: (spies.measuresFrame.mock.lastCall?.[0] as TokenSeen | undefined)?.('goblin'),
        pins: applied(lastAnswer(spies.pinsFrame)),
        tokens: applied(lastAnswer(spies.tokensFrame)),
        measures: applied(lastAnswer(spies.measuresFrame)),
        fog: applied(lastAnswer(spies.fogFrame)),
        drawings: applied(lastAnswer(spies.drawingsFrame)),
        selection: applied(lastAnswer(spies.selection)),
        lighting: applied(lastAnswer(spies.lightingFrame)),
        gmOverlays: Object.values(overlays).every((layer) => !layer.visible),
        hexLinks: viewport.getChildByLabel('hex-links', true)?.visible,
        stairs: viewport.getChildByLabel('level-links', true)?.visible,
        floorGhost: (lastAnswer<Container | null>(spies.floorGhost))?.visible,
        placer: placer.layers.map((layer) => layer.visible),
        ring: ring.visible,
        overlay: overlay.visible,
        frameOnly: frameOnly.visible,
      };
    }, DEFAULT_SETTINGS.localPlayerView, FRAME);
    expect(during).toEqual({
      camera: [640 - 600 * 2, 360 - 400 * 2, 2],
      ghost: false,
      goblin: false,
      tokensBySight: 'unseen',
      measuresBySight: false,
      pins: true, tokens: true, measures: true, fog: true, drawings: true, selection: true, lighting: true, gmOverlays: true,
      hexLinks: false,
      stairs: false,
      floorGhost: false,
      placer: [false, false],
      ring: false,
      overlay: false,
      frameOnly: true,
    });
    // The map image and the roof at the frame's own detail; nothing held still
    expect(spies.mapImageView).toHaveBeenLastCalledWith(frameView(FRAME));
    expect(spies.roofView).toHaveBeenLastCalledWith(frameView(FRAME));
    expect([spies.mapImagePoster, spies.roofWhole, spies.liquidsStill, spies.effectsStill].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
    // The frame, its one piece through the canvas, and the GM's frame again
    expect(render).toHaveBeenCalledTimes(3);
    expect(stageState(viewport.parent!)).toEqual(before);
    expect([viewport.position.x, viewport.position.y, viewport.scale.x]).toEqual([GM_CAMERA.x, GM_CAMERA.y, GM_CAMERA.scale]);
  });

  it('shows players a token the lighting sees, and a measurement from it', async () => {
    const { view, spies } = await scene();
    sight.sees = true;
    const { renderer, store } = view;
    const goblin = renderer.getTokenRenderer()!.getTokenSprites().goblin!;
    let seen: unknown[] = [];
    renderer.withPlayerSafeFrame(() => {
      seen = [goblin.visible, (spies.tokensFrame.mock.lastCall?.[1] as TokenPerception)('goblin'), (spies.measuresFrame.mock.lastCall?.[0] as TokenSeen)('goblin')];
    }, DEFAULT_SETTINGS.localPlayerView, FRAME);
    expect(seen).toEqual([true, 'seen', true]);
  });

  it('lights a picture of the scene for its own frame, and leaves out the wall editor the GM has open', async () => {
    const { view, spies } = await scene();
    view.store.getState().setActiveTool('wall');
    const { wallEditor } = lastAnswer<GmOverlays>(spies.gmOverlays);
    expect(wallEditor.visible).toBe(true);
    sceneLit.mockClear();
    const frame = { x: 0, y: 0, width: 800, height: 600, resolution: 1 };
    expect(view.renderer.captureSceneFrame(frame, () => wallEditor.visible)).toBe(false);
    expect(sceneLit).toHaveBeenCalledTimes(1);
    expect(sceneLit).toHaveBeenCalledWith(frame, expect.any(Function));
    expect(wallEditor.visible).toBe(true);
  });

  it('takes a picture of the scene as the GM sees it, without the GM\'s marks, and puts every part back', async () => {
    const { view, ring, frameOnly, spies } = await scene();
    const { renderer, viewport } = view;
    const goblin = renderer.getTokenRenderer()!.getTokenSprites().goblin!;
    const ghost = renderer.getTokenRenderer()!.getTokenSprites().ghost!;
    const placer = renderer.getTokenPlacer()!;
    // Session view takes the hidden token and the one out of sight off the canvas
    view.store.getState().setGMView(false);
    const before = stageState(viewport.parent!);
    const frame = { x: 0, y: 0, width: 800, height: 600, resolution: 1 };
    const view600 = { rect: { x: 0, y: 0, width: 800, height: 600 }, worldPerScreenPixel: 2 };
    const during = renderer.captureSceneFrame(frame, () => ({
      camera: [viewport.position.x, viewport.position.y, viewport.scale.x],
      ghost: [ghost.visible, ghost.alpha],
      goblin: goblin.visible,
      pins: applied(lastAnswer(spies.pinsPicture)),
      tokens: applied(lastAnswer(spies.tokensPicture)),
      measures: applied(lastAnswer(spies.measuresPicture)),
      fog: applied(lastAnswer(spies.fogPicture)),
      drawings: applied(lastAnswer(spies.drawingsPicture)),
      selection: applied(lastAnswer(spies.selection)),
      gmOverlays: Object.values(lastAnswer<GmOverlays>(spies.gmOverlays)).every((layer) => !layer.visible),
      hexLinks: viewport.getChildByLabel('hex-links', true)?.visible,
      stairs: viewport.getChildByLabel('level-links', true)?.visible,
      floorGhost: (lastAnswer<Container | null>(spies.floorGhost))?.visible,
      placer: placer.layers.map((layer) => layer.visible),
      ring: ring.visible,
      frameOnly: frameOnly.visible,
    }), view600);
    expect(during).toEqual({
      camera: [GM_CAMERA.x, GM_CAMERA.y, GM_CAMERA.scale],
      ghost: [true, 0.5],
      goblin: true,
      pins: true, tokens: true, measures: true, fog: true, drawings: true, selection: true, gmOverlays: true,
      hexLinks: false,
      stairs: false,
      floorGhost: false,
      placer: [false, false],
      ring: false,
      frameOnly: false,
    });
    // The map image and the roof at the picture's detail, a video's poster, the roof whole, liquids and effects still
    expect(spies.mapImageView).toHaveBeenLastCalledWith(view600);
    expect(spies.roofView).toHaveBeenLastCalledWith(view600);
    expect(spies.roofWhole).toHaveBeenCalledWith(frame, expect.any(Function));
    expect([spies.mapImagePoster, spies.liquidsStill, spies.effectsStill].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
    expect(stageState(viewport.parent!)).toEqual(before);
  });
});
