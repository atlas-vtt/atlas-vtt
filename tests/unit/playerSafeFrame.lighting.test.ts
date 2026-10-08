import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { LayerVisibility } from '../../src/app/pixi/playerSafeFrame';

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
    pixiAppManager: { getApp: () => ({ renderer: { render }, stage: {} }), getViewport: () => null },
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
    renderer.withPlayerSafeFrame(() => seen.push(modeLayer.visible, overlay.visible), SETTINGS);
    expect(seen).toEqual([true, false]);
    expect(modeLayer.visible).toBe(false);
    expect(overlay.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('hides tokens by the lighting\'s sight', () => {
    const { renderer, isSeen, getPlayerViewLayers } = harness(true);
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, isSeen);
  });

  it('hides nothing by sight in a view without lighting', () => {
    const { renderer, getPlayerViewLayers } = harness(false);
    renderer.withPlayerSafeFrame(() => undefined, SETTINGS);
    expect(getPlayerViewLayers).toHaveBeenCalledWith(SETTINGS, undefined);
  });
});
