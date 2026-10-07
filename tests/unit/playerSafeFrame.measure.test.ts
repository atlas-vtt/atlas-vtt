import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { measurePlayersView } from '../../src/app/pixi/measurePlayersView';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { computeTokenPixelSize } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SETTINGS = { showGrid: true, showTokenNameplates: true } as never;

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
    pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: () => null },
    tokenRenderer: options.tokens === false ? undefined : { getPlayerViewLayers: () => [], getGmViewLayers: () => [], playersSeeInFrame },
    measureRenderer: { getPlayerViewLayers, getGmViewLayers: (): LayerVisibility[] => [{ layer: part, visible: true }] },
    dmScreenOverlays: new Set(),
    lightingFeature: options.lighting ? { controller: { playerSight: () => sight, playerLayers: (): LayerVisibility[] => [] } } : undefined,
  });
  return { renderer, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers };
}

describe('withPlayerSafeFrame and the measurements', () => {
  it('asks once per capture which tokens the players see, by the lighting\'s sight, and hides measurements by it', () => {
    const { renderer, part, sight, seenInFrame, playersSeeInFrame, getPlayerViewLayers } = harness({ lighting: true });
    const during: boolean[] = [];
    renderer.withPlayerSafeFrame(() => during.push(part.visible), SETTINGS);
    expect(playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(playersSeeInFrame).toHaveBeenCalledWith(sight);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(seenInFrame);
    expect(during).toEqual([false]);
    expect(part.visible).toBe(true);
  });

  it('sees no token while there is no token renderer, so no measurement from one shows', () => {
    const { renderer, getPlayerViewLayers } = harness({ tokens: false });
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS);
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
  it('reads the tokens when asked, follows the players\' view and subscribes once', () => {
    const listeners: Array<() => void> = [];
    const unsubscribe = vi.fn();
    const refreshVisibility = vi.fn();
    const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
      obsApp: createInMemoryApp().app,
      store: { getState: () => ({ objects: { tokens: {} }, tokenSettings: { tokenRingSize: 1 } }) },
      gridSystem: { getOptions: () => ({ size: 70 }) },
      tokenRenderer: { onPlayersViewChange: vi.fn((listener: () => void) => { listeners.push(listener); return unsubscribe; }) },
      measureRenderer: { refreshVisibility, playersView: null },
    });
    const wire = (renderer as unknown as { wireMeasureRendererProvider(): void }).wireMeasureRendererProvider.bind(renderer);
    wire();
    wire();
    expect(listeners).toHaveLength(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    listeners[1]!();
    expect(refreshVisibility).toHaveBeenCalledTimes(1);
    expect((renderer as unknown as { measureRenderer: { playersView: unknown } }).measureRenderer.playersView).not.toBeNull();
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
      playersSeeOnCanvas: vi.fn(() => seenOnCanvas),
    };
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => tokens as never, lighting });
    expect(lighting).not.toHaveBeenCalled();
    const radius = (computeTokenPixelSize(70, 1) / 2) * 1.5;
    expect(view.footprints()).toEqual([{ id: 'goblin', x: 120, y: 100, radius }, { id: 'goblin', x: 100, y: 100, radius }]);
    view.seenAtStart();
    expect(lighting).toHaveBeenCalledTimes(1);
    expect(tokens.playersSeeInFrame).toHaveBeenCalledTimes(1);
    expect(view.seenOnCanvas()).toBe(seenOnCanvas);
  });

  it('fails closed without a token renderer: nothing seen in a frame, the GM view on the canvas', () => {
    const view = measurePlayersView({ store, grid: { getOptions: () => ({ size: 70 }) } as never, tokens: () => undefined, lighting: () => undefined });
    expect(view.seenAtStart()('goblin')).toBe(false);
    expect(view.seenOnCanvas()).toBeNull();
  });
});
