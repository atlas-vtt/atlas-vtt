// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Application, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { TOKEN_UI_Z_INDEX } from '../../../src/app/pixi/TokenControlsUI';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

const LOWER_ART = 'tokens/lower.png';
const UPPER_ART = 'tokens/upper.png';
const GRID = 70;

const character = (id: string, x: number, layer: number, imagePath: string): Character =>
  ({ id, kind: 'character', name: id, showNameplate: true, x, y: 100, size: 1, layer, imagePath, rotation: 0, isHidden: false });

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** The ids of the tokens whose children `layer` holds, in the order the renderer draws them (bottom first); each child is found by where it stands. */
function drawOrder(layer: Container, tokens: readonly Character[]): string[] {
  layer.sortChildren();
  return layer.children.flatMap((child) => tokens.filter((token) => token.x === child.position.x).map((token) => token.id));
}

/** Puts two overlapping tokens on a map; the art of `late` reaches the renderer only once the other token is shown. */
async function pileWithLateArt(late: string): Promise<{ art: string[]; ui: string[] }> {
  const restoreGraphics = stubJsdomGraphics();
  const { app } = createInMemoryApp({ files: { [LOWER_ART]: 'lower-bytes', [UPPER_ART]: 'upper-bytes' } });
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
  const store = createViewAtlasStore(app, `token-pile-${late}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/pile.atlasmap');
  const snap = (x: number, y: number): { x: number; y: number } => ({ x, y });
  const grid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;
  const renderer = new TokenRenderer(app, viewport, grid, () => {}, store, new EventEmitter(), `token-pile-${late}`);
  renderer.setPixiApp({ ticker: { add: () => {}, remove: () => {} }, canvas: document.createElement('canvas'), renderer: { generateTexture: () => new Texture() } } as unknown as Application);
  cleanups.push(() => {
    renderer.destroy();
    viewport.destroy();
    restoreGraphics();
  });

  let release = (): void => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const read = vi.mocked(app.vault.readBinary).getMockImplementation()!;
  vi.mocked(app.vault.readBinary).mockImplementation(async (file) => {
    if (file.path === late) await held;
    return read(file);
  });

  // Listed against their layers, as a map whose tokens were raised after they were placed
  const tokens = [character('upper', 130, 2, UPPER_ART), character('lower', 100, 1, LOWER_ART)];
  store.setState({ objects: { ...store.getState().objects, tokens: Object.fromEntries(tokens.map((token) => [token.id, token])) } });
  const early = tokens.find((token) => token.imagePath !== late)!.id;
  await vi.waitFor(() => expect(renderer.getTokenSprites()[early]).toBeInstanceOf(Container));
  release();
  await vi.waitFor(() => expect(Object.values(renderer.getTokenSprites()).filter(Boolean)).toHaveLength(2));

  const uiLayer = viewport.children.find((child) => child.zIndex === TOKEN_UI_Z_INDEX && child.isRenderGroup)!;
  return { art: drawOrder(renderer.getTokenContainer(), tokens), ui: drawOrder(uiLayer, tokens) };
}

describe('token pile', () => {
  it('stacks overlapping tokens, and the bars, badges and nameplates around them, by layer whichever art arrives first', async () => {
    for (const late of [LOWER_ART, UPPER_ART]) {
      expect(await pileWithLateArt(late)).toEqual({ art: ['lower', 'upper'], ui: ['lower', 'upper'] });
    }
  });
});
