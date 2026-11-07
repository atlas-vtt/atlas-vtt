// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, type FederatedPointerEvent, Rectangle, Texture, loadEnvironmentExtensions, updateRenderGroupTransforms } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { TokenResizeUI } from '../../src/app/pixi/TokenResizeUI';
import { TokenRotationUI } from '../../src/app/pixi/TokenRotationUI';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';

const token = { id: 't1', x: 0, y: 0, size: 1, rotation: 0, imagePath: 'art.png' } as TokenEntity;

const store = {
  getState: () => ({
    isPlayerView: false,
    grid: { size: 70 },
    objects: { tokens: { t1: token } },
    selectedIds: ['t1'],
  }),
} as unknown as StoreApi<ViewAtlasState>;

/** Builds a token group with the real factory, then applies the renderer's per-token event setup like syncTokens does. */
async function createTokenGroup(): Promise<Container> {
  const factory = new SpriteFactory({ getOptions: () => ({ size: 70, type: 'square' }) } as unknown as GridSystem);
  // Ring and glass textures are painted on a 2D canvas, which jsdom lacks; both sprites are eventMode 'none' anyway.
  const textures = factory as unknown as { getTokenRingTexture: () => Texture; getGlassTexture: () => Texture };
  vi.spyOn(textures, 'getTokenRingTexture').mockReturnValue(Texture.EMPTY);
  vi.spyOn(textures, 'getGlassTexture').mockReturnValue(Texture.EMPTY);
  const group = await factory.createTokenSprite(token, Texture.EMPTY);
  const harness = { store, interactionController: {}, spriteFactory: {} };
  (TokenRenderer.prototype as unknown as { reestablishTokenInteractivity: (g: Container) => void })
    .reestablishTokenInteractivity.call(harness, group);
  return group;
}

async function buildScene(): Promise<{ stage: Container; viewport: Viewport; group: Container }> {
  const stage = new Container({ isRenderGroup: true });
  const viewport = new Container();
  viewport.eventMode = 'static';
  viewport.hitArea = new Rectangle(-1000, -1000, 2000, 2000);
  stage.addChild(viewport);
  const group = await createTokenGroup();
  viewport.addChild(group);
  return { stage, viewport: viewport as unknown as Viewport, group };
}

/** Refreshes world transforms the way a render pass would, then hit-tests the target's centre. */
function hitAt(stage: Container, target: Container): Container | null {
  updateRenderGroupTransforms(stage.renderGroup!, true);
  const at = target.getGlobalPosition();
  return new EventBoundary(stage).hitTest(at.x, at.y);
}

describe('token handles', () => {
  beforeAll(async () => {
    // jsdom has no 2D canvas; the handle icons are optional and skipped when the context is missing.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // Pixi installs the pointer-event mixin lazily with the browser environment, which a renderer normally triggers.
    await loadEnvironmentExtensions(false);
  });

  it('never targets the token art, so token clicks stay with viewport-level dispatch', async () => {
    const { stage, viewport, group } = await buildScene();
    expect(hitAt(stage, group)).toBe(viewport);
  });

  it('resize handles receive pointer hits', async () => {
    const { stage, viewport, group } = await buildScene();
    const resizeUI = new TokenResizeUI(viewport, store);
    resizeUI.showHandles(['t1'], { t1: group });
    const [handle] = resizeUI.getHandles();
    expect(handle).toBeDefined();
    expect(hitAt(stage, handle!)).toBe(handle);
    resizeUI.destroy();
  });

  it('rotation handles receive pointer hits', async () => {
    const { stage, viewport, group } = await buildScene();
    const rotationUI = new TokenRotationUI(viewport, store);
    rotationUI.showHandles(['t1'], { t1: group });
    const [handle] = rotationUI.getHandles();
    expect(handle).toBeDefined();
    expect(hitAt(stage, handle!)).toBe(handle);
    rotationUI.destroy();
  });

  it('keep their places around the ring when the token is rotated', async () => {
    const { viewport, group } = await buildScene();
    const rotated = { ...token, rotation: 135 };
    const rotatedStore = {
      getState: () => ({ ...store.getState(), objects: { tokens: { t1: rotated } } }),
    } as unknown as StoreApi<ViewAtlasState>;
    const resizeUI = new TokenResizeUI(viewport, rotatedStore);
    const rotationUI = new TokenRotationUI(viewport, rotatedStore);
    try {
      resizeUI.showHandles(['t1'], { t1: group });
      rotationUI.showHandles(['t1'], { t1: group });
      const [left, right] = resizeUI.getHandles();
      const [rotate] = rotationUI.getHandles();
      const radius = right!.position.x;
      expect(radius).toBeGreaterThan(0);
      expect(left!.position.x).toBeCloseTo(-radius, 6);
      expect(left!.position.y).toBeCloseTo(0, 6);
      expect(right!.position.y).toBeCloseTo(0, 6);
      expect(rotate!.position.x).toBeCloseTo(0, 6);
      expect(rotate!.position.y).toBeCloseTo(-radius, 6);
    } finally {
      resizeUI.destroy();
      rotationUI.destroy();
    }
  });

  it('the rotation handle follows a rotation drag and returns to the top when it ends', async () => {
    const { viewport, group } = await buildScene();
    Object.assign(viewport, { toWorld: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }) });
    const rotatingStore = {
      getState: () => ({ ...store.getState(), updateTokens: vi.fn() }),
    } as unknown as StoreApi<ViewAtlasState>;
    const rotationUI = new TokenRotationUI(viewport, rotatingStore);
    try {
      rotationUI.showHandles(['t1'], { t1: group });
      const [handle] = rotationUI.getHandles();
      const radius = -handle!.position.y;
      const pointer = (x: number, y: number): FederatedPointerEvent =>
        ({ global: { x, y }, shiftKey: false, stopPropagation: vi.fn() }) as unknown as FederatedPointerEvent;

      handle!.emit('pointerdown', pointer(0, -50));
      viewport.emit('pointermove', pointer(50, 0));
      expect(handle!.position.x).toBeCloseTo(radius, 6);
      expect(handle!.position.y).toBeCloseTo(0, 6);

      viewport.emit('pointerup', pointer(50, 0));
      expect(handle!.position.x).toBeCloseTo(0, 6);
      expect(handle!.position.y).toBeCloseTo(-radius, 6);
    } finally {
      rotationUI.destroy();
    }
  });
});
