// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { viewAudience } from '../helpers/viewAudience';
import type { MeasurePlayersView } from '../../src/app/pixi/measurePartsVisibility';
import { FRAME, fakePlayerFrames, fakeViewport } from '../mocks/playerFrameSource';

const SETTINGS = { showTokenNameplates: true } as never;

/** The orchestrator with only what a player frame and a picture of the scene read. */
function harness(options: { tokens?: boolean; lighting?: boolean } = {}): {
  renderer: PixiRendererOrchestrator;
  part: { visible: boolean };
  sight: (id: string) => 'seen' | 'unseen';
  seenInFrame: (id: string) => boolean;
  playersSeeInFrame: ReturnType<typeof vi.fn>;
  getPlayerViewLayers: ReturnType<typeof vi.fn>;
} {
  const part = { visible: true };
  const sight = (id: string): 'seen' | 'unseen' => (id === 'hero' ? 'seen' : 'unseen');
  const seenInFrame = (id: string): boolean => id === 'hero';
  const playersSeeInFrame = vi.fn(() => seenInFrame);
  const getPlayerViewLayers = vi.fn((seen: (id: string) => boolean): LayerVisibility[] => [{ layer: part, visible: seen('goblin') }]);
  const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: fakeViewport, getGestures: () => null },
    playerFrames: fakePlayerFrames(),
    tokenRenderer: options.tokens === false ? undefined : { getPlayerViewLayers: () => [], getGmViewLayers: () => [], playersSeeInFrame },
    measureRenderer: { getPlayerViewLayers, getGmViewLayers: (): LayerVisibility[] => [{ layer: part, visible: true }], effects: { stillFor: () => () => undefined } },
    dmScreenOverlays: new Set(),
    playerFrameOnly: new Set(),
    lighting: options.lighting ? { renderer: {}, playerSight: () => sight, playerLayers: (): LayerVisibility[] => [] } : undefined,
  });
  return { renderer, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers };
}

describe('withPlayerSafeFrame and the measurements', () => {
  it('asks once per capture which tokens the players see, by the lighting\'s sight, and hides measurements by it', () => {
    const { renderer, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers } = harness({ lighting: true });
    const during: boolean[] = [];
    renderer.withPlayerSafeFrame(() => during.push(part.visible), SETTINGS, FRAME);
    expect(playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(playersSeeInFrame).toHaveBeenCalledWith(sight);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(seenInFrame);
    expect(during).toEqual([false]);
    expect(part.visible).toBe(true);
  });

  it('sees no token while there is no token renderer, so no measurement from one shows', () => {
    const { renderer, getPlayerViewLayers } = harness({ tokens: false });
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME);
    const seen = getPlayerViewLayers.mock.calls[0]?.[0] as (id: string) => boolean;
    expect(['hero', 'goblin'].map(seen)).toEqual([false, false]);
  });

  it('keeps the measurements as the GM sees them in a picture of the scene', () => {
    const { renderer, part } = harness();
    part.visible = false;
    const during = renderer.captureSceneFrame({} as never, () => part.visible);
    expect(during).toBe(true);
    expect(part.visible).toBe(false);
  });
});

describe('the measure renderer\'s wiring', () => {
  it('reads the tokens and whom the canvas is drawn for when asked, and subscribes once', () => {
    const stopHeights = vi.fn();
    const busOn = vi.fn();
    const busOff = vi.fn();
    const state = { objects: { tokens: {} }, tokenSettings: { tokenRingSize: 1 }, isGMView: true, isPlayerView: false };
    const store = { getState: () => state, subscribe: vi.fn(() => stopHeights) };
    const { audience, peek } = viewAudience(store as never);
    const measureRenderer = { rulesChanged: vi.fn(), followShown: vi.fn(), playersView: null as MeasurePlayersView | null, handles: { pointer: {}, leave: vi.fn() }, ranges: {}, effects: { setMode: vi.fn() } };
    const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
      obsApp: createInMemoryApp().app,
      store,
      audience,
      gridSystem: { getOptions: () => ({ size: 70 }) },
      measureRenderer,
      // The popover of a kept measurement closes when the view is left
      eventBus: { on: busOn, off: busOff },
      viewId: 'view',
    });
    const wire = (renderer as unknown as { wireMeasureRendererProvider(): void }).wireMeasureRendererProvider.bind(renderer);
    wire();
    wire();
    // The tokens' heights are followed once, for the rulers that end on fliers
    expect(stopHeights).toHaveBeenCalledTimes(1);
    // And leaving the view is heard once
    expect([busOn.mock.calls.length, busOff.mock.calls.length]).toEqual([2, 1]);
    const view = measureRenderer.playersView!;
    const heard = vi.fn();
    view.onChange(heard);
    expect(view.seenOnCanvas()).toBeNull();
    peek(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(view.seenOnCanvas()).not.toBeNull();
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
