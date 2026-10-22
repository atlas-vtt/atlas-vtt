// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { TokenResizeUI } from '../../src/app/pixi/TokenResizeUI';
import { TokenRotationUI } from '../../src/app/pixi/TokenRotationUI';
import { UIManager } from '../../src/app/pixi/token-renderer/UIManager';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import { computeTokenPixelSize, tokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { MOTION_SLOW_MS } from '../../src/app/utils/motion';
import { HP } from '../mocks/resourceFixtures';

const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0, size: 1, rotation: 0,
  resources: { hp: { current: 5, max: 10 } } };

const medium = computeTokenPixelSize(70, 1);
const gargantuan = computeTokenPixelSize(70, 2.5);

/** World-space length of `units` along `target`'s local x axis. */
function worldLength(target: Container, root: Container, units: number): number {
  return root.toLocal(target.toGlobal({ x: units, y: 0 })).x - root.toLocal(target.toGlobal({ x: 0, y: 0 })).x;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('token UI scale', () => {
  it('keeps a medium token on a 70px grid at the design size and grows linearly with the token', () => {
    expect(tokenUIScale(medium)).toBe(1);
    expect(tokenUIScale(gargantuan)).toBe(4);
  });

  /** Screen size of a selected token's 64-unit bar: SELECTED_TOKEN_UI_SCREEN_SCALE × 64. */
  const selectedBarOnScreen = 64 * 2.25;

  /** A DM view with `hero` as a `spriteWidth` px token at world (100, 100), with its UI and +/- controls. */
  function buildView(spriteWidth: number, zoom = 1): {
    store: ReturnType<typeof createViewAtlasStore>; viewport: Container; uiManager: UIManager; tokenGroup: Container;
    barWorldWidth: () => number; barScreenWidth: () => number; controlsScale: () => number;
  } {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'token-ui-scale');
    const token = { ...hero, size: spriteWidth === medium ? 1 : 2.5 };
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero: token } } });
    const viewport = new Container();
    viewport.scale.set(zoom);
    const tokenLayer = new Container({ label: 'tokenContainer' });
    const tokenGroup = Object.assign(new Container(), { tokenId: 'hero', tokenSize: spriteWidth });
    const sprite = new Graphics().rect(-spriteWidth / 2, -spriteWidth / 2, spriteWidth, spriteWidth).fill(0xffffff);
    sprite.label = 'tokenSprite';
    tokenGroup.addChild(sprite);
    tokenGroup.position.set(100, 100);
    tokenLayer.addChild(tokenGroup);
    viewport.addChild(tokenLayer);
    const uiManager = new UIManager(viewport as unknown as Viewport, store, 'token-ui-scale');
    uiManager.resourceDefsProvider = () => [HP];
    uiManager.setTokenSpriteProvider(() => tokenGroup as unknown as TokenGroupContainer);
    uiManager.createTokenUI('hero', tokenGroup as unknown as TokenGroupContainer, token);
    const belowToken = uiManager.getTokenUIs().hero!.getContainer().children[0] as Container;
    const barWorldWidth = (): number => worldLength(belowToken, viewport, 64);
    return {
      store, viewport, uiManager, tokenGroup, barWorldWidth,
      barScreenWidth: () => barWorldWidth() * viewport.scale.x,
      // The controls scale in their anchor on the token's bottom edge, the container's first child
      controlsScale: () => uiManager.getControlsUI()!.getContainer().children[0]!.scale.x,
    };
  }

  function useAnimationFrames(): void {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  }

  afterEach(() => { vi.useRealTimers(); });

  it.each([medium, gargantuan])('keeps an unselected %i px token\'s bars at the grid\'s resting size just below it', (spriteWidth) => {
    const { uiManager, viewport, barWorldWidth } = buildView(spriteWidth);
    try {
      const belowToken = uiManager.getTokenUIs().hero!.getContainer().children[0] as Container;
      // The HP bar starts 2 UI units below the token edge and is 64 UI units wide
      expect(viewport.toLocal(belowToken.toGlobal({ x: 0, y: 2 })).y).toBeCloseTo(100 + spriteWidth / 2 + 2, 6);
      expect(barWorldWidth()).toBeCloseTo(64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it.each([
    [medium, 0.5], [medium, 1], [gargantuan, 0.5], [gargantuan, 1.5],
  ])('shows a selected %i px token\'s bars and controls at one size on screen at zoom %d', (spriteWidth, zoom) => {
    useAnimationFrames();
    const { store, uiManager, barScreenWidth, barWorldWidth, controlsScale } = buildView(spriteWidth, zoom);
    try {
      store.getState().setSelection(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      expect(barScreenWidth()).toBeCloseTo(selectedBarOnScreen, 6);
      expect(controlsScale()).toBeCloseTo(barWorldWidth() / 64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('never shrinks a selected token\'s bars below the resting size when zoomed far in', () => {
    useAnimationFrames();
    const { store, uiManager, barWorldWidth } = buildView(gargantuan, 4);
    try {
      store.getState().setSelection(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      expect(barWorldWidth()).toBeCloseTo(64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('keeps a selected token\'s bars at their screen size while the map zooms', () => {
    useAnimationFrames();
    const { store, viewport, uiManager, barScreenWidth, barWorldWidth, controlsScale } = buildView(gargantuan);
    try {
      store.getState().setSelection(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      viewport.scale.set(0.4);
      const zoomedViewport = viewport as unknown as Viewport;
      zoomedViewport.emit('zoomed', { viewport: zoomedViewport, type: 'wheel' });
      expect(barScreenWidth()).toBeCloseTo(selectedBarOnScreen, 6);
      expect(controlsScale()).toBeCloseTo(barWorldWidth() / 64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('eases the bars and controls to the selected size, back to rest while dragged, and turns around mid-way', () => {
    useAnimationFrames();
    const { store, uiManager, barScreenWidth, barWorldWidth, controlsScale } = buildView(gargantuan);
    try {
      store.getState().setSelection(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS / 3);
      // The ease-out covers most of the way early on, without arriving yet
      expect(barScreenWidth()).toBeGreaterThan(64 + (selectedBarOnScreen - 64) * 0.75);
      expect(barScreenWidth()).toBeLessThan(selectedBarOnScreen);
      expect(controlsScale()).toBeCloseTo(barWorldWidth() / 64, 6);
      vi.advanceTimersByTime(MOTION_SLOW_MS);
      expect(barScreenWidth()).toBeCloseTo(selectedBarOnScreen, 6);

      uiManager.setTokensHeld(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS / 3);
      const turnaround = barScreenWidth();
      expect(turnaround).toBeLessThan(selectedBarOnScreen);
      expect(turnaround).toBeGreaterThan(64);
      uiManager.setTokensHeld([]);
      vi.advanceTimersByTime(16);
      expect(barScreenWidth()).toBeGreaterThanOrEqual(turnaround);
      vi.advanceTimersByTime(MOTION_SLOW_MS);
      expect(barScreenWidth()).toBeCloseTo(selectedBarOnScreen, 6);
      expect(controlsScale()).toBeCloseTo(barWorldWidth() / 64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('keeps a token selected by a press at rest until the pointer is released', () => {
    useAnimationFrames();
    const { store, uiManager, barWorldWidth } = buildView(gargantuan);
    try {
      store.getState().setSelection(['hero']);
      uiManager.setTokensHeld(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      expect(barWorldWidth()).toBeCloseTo(64, 6);
      uiManager.setTokensHeld([]);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      expect(barWorldWidth()).toBeCloseTo(selectedBarOnScreen, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('switches the bar size at once when reduced motion is requested', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { store, uiManager, barScreenWidth } = buildView(gargantuan);
    try {
      store.getState().setSelection(['hero']);
      expect(barScreenWidth()).toBeCloseTo(selectedBarOnScreen, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('lays the +/- controls out for a selected token\'s new size, also when resized behind a gesture', () => {
    useAnimationFrames();
    const { store, uiManager, barWorldWidth, controlsScale } = buildView(gargantuan);
    const controls = uiManager.getControlsUI()!;
    try {
      store.getState().setSelection(['hero']);
      vi.advanceTimersByTime(MOTION_SLOW_MS + 50);
      window.dispatchEvent(new CustomEvent('atlas-token-resize-started', { detail: { tokenIds: ['hero'] } }));
      uiManager.syncUIScale('hero', medium);
      window.dispatchEvent(new CustomEvent('atlas-token-resize-ended', { detail: { tokenIds: ['hero'] } }));
      expect(controls.getContainer().visible).toBe(true);
      expect(controls.getContainer().position.y + controls.getContainer().children[0]!.position.y).toBe(100 + medium / 2);
      expect(controlsScale()).toBeCloseTo(barWorldWidth() / 64, 6);
    } finally { uiManager.destroyAll(); }
  });

  it('scales resize and rotation handles with the token, including while it is resized', () => {
    // The handle icons are optional and skipped without a 2D canvas.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const state = { grid: { size: 70 }, objects: { tokens: { hero: { ...hero, size: 2.5 } } }, selectedIds: ['hero'] };
    const store = { getState: () => state } as unknown as StoreApi<ViewAtlasState>;
    const viewport = new Container();
    const tokenGroup = new Container();
    viewport.addChild(tokenGroup);
    const resizeUI = new TokenResizeUI(viewport as unknown as Viewport, store);
    const rotationUI = new TokenRotationUI(viewport as unknown as Viewport, store);
    try {
      resizeUI.showHandles(['hero'], { hero: tokenGroup });
      rotationUI.showHandles(['hero'], { hero: tokenGroup });
      const handles = [...resizeUI.getHandles(), ...rotationUI.getHandles()];
      expect(handles).toHaveLength(3);
      for (const handle of handles) expect(handle.scale.x).toBe(4);
      rotationUI.updateHandlePositions(undefined, { hero: 1 });
      expect(rotationUI.getHandles()[0]!.scale.x).toBe(1);
    } finally {
      resizeUI.destroy();
      rotationUI.destroy();
    }
  });
});
