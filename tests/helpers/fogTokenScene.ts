import '../setup/obsidianDom';
import { Application, Container, RenderTexture, Sprite, Texture, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { afterEach, expect, vi } from 'vitest';

vi.mock('events', async () => import('eventemitter3'));
import { GridSystem } from '../../src/app/grid/GridSystem';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { TokenPerception } from '../../src/app/vision/tokenPerception';
import type { Character } from '../../src/app/types';
import type { FogOperation } from '../../src/app/types/fogTypes';

export function fogTokenScenes(): { scene: typeof createScene } {
  const cleanups: Array<() => void> = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

  async function createScene(): Promise<{
    tokens: TokenRenderer;
    fog: FogOfWarRenderer;
    store: ReturnType<typeof createViewAtlasStore>;
    setFog(operations: Record<string, FogOperation>): void;
    pixels(player?: boolean, drawFog?: boolean, perception?: TokenPerception): Uint8ClampedArray;
  }> {
    const renderer = await createTestRenderer(256);
    const watch = watchGl(renderer.gl);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: 256, screenHeight: 256, worldWidth: 256, worldHeight: 256, events: renderer.events });
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.tint = 0x202020;
    floor.setSize(256, 256);
    viewport.addChild(floor);
    const obsidian = createInMemoryApp().app;
    const store = createViewAtlasStore(obsidian, 'fog-token-test');
    store.getState().setPersistenceEnabled(false);
    store.setState({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true });
    const events = new EventEmitter();
    const grid = new GridSystem(app, viewport, floor, { size: 40, enabled: false, color: 0xffffff });
    const tokens = new TokenRenderer(obsidian, viewport, grid, () => {}, store, events, 'fog-token-test');
    tokens.setPixiApp(app);
    const fog = new FogOfWarRenderer(viewport, app, events, store);
    viewport.addChild(fog.getContainer());
    tokens.setFogCoverageProvider(() => fog.getCommittedCoverage());
    const covered: Character = { id: 'covered', x: 64, y: 64, size: 1, imagePath: '', kind: 'character', name: 'Covered token name outside fog', showNameplate: true };
    const clear: Character = { id: 'clear', x: 192, y: 64, size: 1, imagePath: '', kind: 'character', name: 'Clear', showNameplate: true };
    store.getState().addToken(covered);
    store.getState().addToken(clear);
    await expect.poll(() => Object.values(tokens.getTokenSprites()).filter((sprite) => sprite instanceof Container).length).toBe(2);
    const target = RenderTexture.create({ width: 256, height: 256 });
    cleanups.push(() => {
      tokens.destroy();
      fog.destroy();
      grid.destroy();
      target.destroy(true);
      app.ticker.destroy();
      destroyTree(viewport);
      app.stage.destroy();
      watch.stop();
      expect(watch.findings).toEqual([]);
      renderer.destroy();
    });
    return {
      tokens, fog, store,
      setFog(operations): void { store.setState((state) => ({ objects: { ...state.objects, fog: operations } })); },
      pixels(player = false, drawFog = true, perception?: TokenPerception): Uint8ClampedArray {
        let result: Uint8ClampedArray = new Uint8ClampedArray();
        const read = (): void => {
          renderer.render({ container: app.stage, target, clear: true });
          result = renderer.extract.pixels({ target }).pixels;
        };
        const layers = player ? [...tokens.getPlayerViewLayers(DEFAULT_SETTINGS.localPlayerView, perception), ...fog.getPlayerViewLayers()] : [];
        if (!drawFog) layers.push({ layer: fog.getContainer(), visible: false });
        captureWithLayerVisibility(layers, () => {}, read);
        return result;
      },
    };
  }
  return { scene: createScene };
}
