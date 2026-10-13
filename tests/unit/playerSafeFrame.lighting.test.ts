import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { FRAME, fakePlayerFrames, fakeViewport } from '../mocks/playerFrameSource';

const SETTINGS = { showTokenNameplates: true } as never;

interface Harness {
  renderer: PixiRendererOrchestrator;
  overlay: { visible: boolean };
  modeLayer: { visible: boolean };
  isSeen: (tokenId: string) => 'seen' | 'unseen';
  getPlayerViewLayers: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
}

/** The orchestrator with only what a player frame reads: the app, the tokens and the lighting. */
function harness(lighting: boolean): Harness {
  const overlay = { visible: true };
  const modeLayer = { visible: false };
  const isSeen = (tokenId: string): 'seen' | 'unseen' => (tokenId === 'hero' ? 'seen' : 'unseen');
  const getPlayerViewLayers = vi.fn((): LayerVisibility[] => []);
  const render = vi.fn();
  const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getApp: () => ({ renderer: { render }, stage: {} }), getViewport: fakeViewport },
    playerFrames: fakePlayerFrames(render),
    tokenRenderer: { getPlayerViewLayers },
    dmScreenOverlays: new Set(),
    lightingFeature: lighting ? { controller: {
      playerSight: () => isSeen,
      playerLayers: (): LayerVisibility[] => [{ layer: modeLayer, visible: true }, { layer: overlay, visible: false }],
    } } : undefined,
  });
  return { renderer, overlay, modeLayer, isSeen, getPlayerViewLayers, render };
}

describe('withPlayerSafeFrame and the lighting', () => {
  it('applies the lighting\'s player layers for the capture and puts the GM\'s back', () => {
    const { renderer, overlay, modeLayer, render } = harness(true);
    const seen: boolean[] = [];
    renderer.withPlayerSafeFrame(() => seen.push(modeLayer.visible, overlay.visible), SETTINGS, FRAME);
    expect(seen).toEqual([true, false]);
    expect(modeLayer.visible).toBe(false);
    expect(overlay.visible).toBe(true);
    // The players' frame, then the GM's own again: the frame's pieces went through the canvas
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('leaves the GM\'s frame to the render that follows, where one does', () => {
    const { renderer, render } = harness(true);
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME, true);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders the players\' frame through its own camera, centred in its own size, and puts the GM\'s camera back', () => {
    const { renderer } = harness(true);
    const viewport = fakeViewport();
    viewport.position.set(-40, 30);
    viewport.scale.set(2, 2);
    const during: number[] = [];
    Object.assign(renderer, {
      pixiAppManager: { getApp: () => ({ renderer: { render: vi.fn() }, stage: {} }), getViewport: () => viewport },
      playerFrames: fakePlayerFrames(() => during.push(viewport.position.x, viewport.position.y, viewport.scale.x)),
    });
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, { ...FRAME, width: 2560, height: 1440, resolution: 2, centerX: 100, centerY: 50, scale: 0.5 });
    // 2560 × 1440 pixels at two to a point are 1280 × 720 points
    expect(during).toEqual([640 - 100 * 0.5, 360 - 50 * 0.5, 0.5]);
    expect([viewport.position.x, viewport.position.y, viewport.scale.x]).toEqual([-40, 30, 2]);
  });

  it('renders and copies nothing while the graphics context is lost', () => {
    const { renderer, render, modeLayer } = harness(true);
    Object.assign(renderer, { playerFrames: { ...fakePlayerFrames(render), canRender: () => false } });
    const copy = vi.fn();
    renderer.withPlayerSafeFrame(copy, SETTINGS, FRAME);
    expect(copy).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(modeLayer.visible).toBe(false);
  });

  it('puts the GM\'s layers and frame back when the players\' frame fails', () => {
    const { renderer, render, overlay } = harness(true);
    Object.assign(renderer, { playerFrames: { ...fakePlayerFrames(), render: () => { throw new Error('failed'); } } });
    expect(() => renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME)).toThrow('failed');
    expect(overlay.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('hides tokens by the lighting\'s sight', () => {
    const { renderer, isSeen, getPlayerViewLayers } = harness(true);
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, isSeen);
  });

  it('hides nothing by sight in a view without lighting', () => {
    const { renderer, getPlayerViewLayers } = harness(false);
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS, FRAME);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, undefined);
  });
});
