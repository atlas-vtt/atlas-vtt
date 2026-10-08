import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'events';
import { createStore } from 'zustand/vanilla';
import { captureWithLayerVisibility, hiddenTokenLayers } from '../../src/app/pixi/playerSafeFrame';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';

describe('hiddenTokenLayers', () => {
  it('hides only the sprites of hidden tokens for the player frame and restores them', () => {
    const hidden = new Container();
    const shown = new Container();
    const tokens = { ghost: { isHidden: true }, hero: { isHidden: false } };
    const layers = hiddenTokenLayers(tokens, { ghost: hidden, hero: shown, gone: null });

    expect(layers).toEqual([{ layer: hidden, visible: false }]);
    captureWithLayerVisibility(layers, () => {}, () => {
      expect(hidden.visible).toBe(false);
      expect(shown.visible).toBe(true);
    });
    expect(hidden.visible).toBe(true);
  });
});

describe('captureWithLayerVisibility with a player camera', () => {
  it('renders from the frozen camera and restores the DM camera afterwards', () => {
    const viewport = Object.assign(new Container(), { screenWidth: 800, screenHeight: 600 });
    viewport.position.set(-100, -50);
    viewport.scale.set(2, 2);
    const renders: Array<{ x: number; y: number; scale: number }> = [];
    const render = (): void => { renders.push({ x: viewport.x, y: viewport.y, scale: viewport.scale.x }); };
    const camera = { centerX: 500, centerY: 400, scale: 0.5 };

    captureWithLayerVisibility([], render, () => {
      expect(viewport.scale.x).toBe(0.5);
      expect(viewport.x).toBe(400 - 500 * 0.5);
      expect(viewport.y).toBe(300 - 400 * 0.5);
    }, { target: viewport, camera, screen: { width: 800, height: 600 } });

    expect(renders).toEqual([{ x: 150, y: 100, scale: 0.5 }, { x: -100, y: -50, scale: 2 }]);
    expect(viewport.scale.y).toBe(2);
  });
});

describe('SelectionManager.getPlayerViewLayers', () => {
  it('hides the selection overlay and marquee for the player frame', () => {
    const viewport = new Container();
    const store = createStore(() => ({ selectedIds: [], activeTool: 'select', selectionMode: 'box', objects: { tokens: {}, drawings: {} } }));
    const manager = new SelectionManager(viewport as never, () => ({}), () => ({}), store as never, new EventEmitter());
    const layers = manager.getPlayerViewLayers();

    expect(layers).toHaveLength(2);
    expect(layers.every(entry => !entry.visible && viewport.children.includes(entry.layer as Container))).toBe(true);
  });
});
