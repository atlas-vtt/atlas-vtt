import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { Container, Sprite, type Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';
import { HIGHLIGHT_EDGE, SELECTION_LOOK } from '../../src/app/pixi/selection/selectionGeometry';
import { INK_SHADE_REACH as SHADE_REACH } from '../../src/app/pixi/utils/canvasInk';
import type { BarsSpan } from '../../src/app/pixi/token-renderer/types';

/** A token group at (x, y) with art 70 px wide and the ring every token has by default (78 px across). */
function token(x: number, y: number): Container {
  const group = new Container();
  const sprite = group.addChild(new Sprite());
  sprite.label = 'tokenSprite';
  sprite.width = 70;
  sprite.height = 70;
  group.position.set(x, y);
  return group;
}

/** A fog operation covering 600..700 × 300..400 of the world. */
function fogArea(viewport: Container): Container {
  const sprite = viewport.addChild(new Sprite());
  sprite.position.set(600, 300);
  sprite.width = 100;
  sprite.height = 100;
  return sprite;
}

function setup(selectedIds: string[], bars: (zoom: number) => BarsSpan = () => ({ halfWidth: 50, reach: 24 })) {
  const tokens = { goblin: token(100, 100), orc: token(300, 100) };
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => point });
  const fog = { smoke: fogArea(viewport) };
  const store = createStore(subscribeWithSelector(() => ({
    selectedIds, activeTool: 'select', selectionMode: 'box',
    objects: { tokens: { goblin: { id: 'goblin' }, orc: { id: 'orc' } }, drawings: {} },
  })));
  const manager = new SelectionManager(viewport as never, () => tokens, () => fog, store as never, new EventEmitter());
  manager.barsProvider = () => bars(viewport.scale.x);
  manager.updateSelectionOverlay();
  const layer = manager.getPlayerViewLayers()[0]!.layer as Container;
  const highlights = (): Container[] => layer.children.filter((child) => child.label === 'selectionHighlight');
  const group = layer.children.find((child) => child.label === 'selectionGroupFrame') as Graphics;
  return { viewport, manager, highlights, group };
}

/** The accent's middle stands this far outside the token's ring, in screen pixels. */
const ACCENT_OFFSET = SELECTION_LOOK.gap + SELECTION_LOOK.stroke / 2;

describe('SelectionManager highlights', () => {
  it('outlines a single token by its ring, without a group frame', () => {
    const { highlights, group } = setup(['goblin']);
    expect(highlights()).toHaveLength(1);
    expect(highlights()[0]!.position).toMatchObject({ x: 100, y: 100 });
    expect(group.context.instructions).toHaveLength(0);
  });

  it('keeps the line and its gap the same on screen at any zoom', () => {
    const { viewport, highlights } = setup(['goblin']);
    const accentRadius = (): number => {
      const view = highlights()[0]!;
      const bounds = view.children[0]!.getLocalBounds();
      // The outermost band's edge lies HIGHLIGHT_EDGE plus the shade beyond the accent's middle
      return bounds.width / 2 - HIGHLIGHT_EDGE - SHADE_REACH;
    };
    expect(accentRadius()).toBeCloseTo(39 + ACCENT_OFFSET, 0);
    viewport.scale.set(3);
    viewport.emit('zoomed', {});
    expect(highlights()[0]!.scale.x).toBeCloseTo(1 / 3);
    expect(accentRadius()).toBeCloseTo(39 * 3 + ACCENT_OFFSET, 0);
  });

  it('frames two or more together around their highlights and bars', () => {
    const { highlights, group } = setup(['goblin', 'orc']);
    expect(highlights()).toHaveLength(2);
    const { minX, maxX, minY, maxY } = group.bounds;
    const pad = SELECTION_LOOK.groupGap + SELECTION_LOOK.groupStroke;
    // The bars are wider than the ring's highlight and reach 24 below the token's edge
    expect(minX).toBeCloseTo(100 - 50 - pad, 0);
    expect(maxX).toBeCloseTo(300 + 50 + pad, 0);
    expect(minY).toBeCloseTo(100 - 39 - ACCENT_OFFSET - HIGHLIGHT_EDGE - pad, 0);
    expect(maxY).toBeCloseTo(100 + 35 + 24 + pad, 0);
  });

  it('takes hold of the group exactly where its frame is drawn, padded on screen and holding the bars', () => {
    const { viewport, manager } = setup(['goblin', 'orc']);
    const pad = SELECTION_LOOK.groupGap + SELECTION_LOOK.groupStroke;
    // Between the tokens, and under them where only their bars are
    expect(manager.groupFrameContains(200, 100)).toBe(true);
    expect(manager.groupFrameContains(200, 100 + 35 + 24 + pad - 0.2)).toBe(true);
    expect(manager.groupFrameContains(200, 100 + 35 + 24 + pad + 0.2)).toBe(false);
    expect(manager.groupFrameContains(100 - 50 - pad - 0.2, 100)).toBe(false);
    // Zoomed out, the same screen padding reaches further into the world
    viewport.scale.set(0.5);
    viewport.emit('zoomed', {});
    expect(manager.groupFrameContains(200, 100 + 35 + 24 + 2 * pad - 0.4)).toBe(true);
    expect(manager.groupFrameContains(200, 100 + 35 + 24 + 2 * pad + 0.4)).toBe(false);
  });

  it('gives a single selection no frame to take hold of', () => {
    const { manager } = setup(['goblin']);
    expect(manager.groupFrameContains(100, 100)).toBe(false);
  });

  it('measures the bars again on zoom, since a selected token keeps their size on screen', () => {
    // Bars 100 by 24 screen pixels below the token's edge, whatever the zoom
    const { viewport, manager } = setup(['goblin', 'orc'], (zoom) => ({ halfWidth: 50 / zoom, reach: 24 / zoom }));
    viewport.scale.set(1.5);
    viewport.emit('zoomed', {});
    viewport.scale.set(0.5);
    viewport.emit('zoomed', {});
    // The goblin's bars now reach 100 world units to its left and 48 below its edge
    expect(manager.groupFrameContains(100 - 99, 100 + 35 + 47)).toBe(true);
    expect(manager.groupFrameContains(200, 100 + 35 + 48 + 2 * SELECTION_LOOK.groupGap - 1)).toBe(true);
  });

  it('outlines selected fog but frames and grabs only what a group drag moves', () => {
    const withFog = setup(['goblin', 'orc', 'smoke']);
    expect(withFog.highlights()).toHaveLength(3);
    expect(withFog.manager.groupFrameContains(200, 100)).toBe(true);
    expect(withFog.manager.groupFrameContains(650, 350)).toBe(false);
    const oneToken = setup(['goblin', 'smoke']);
    expect(oneToken.highlights()).toHaveLength(2);
    expect(oneToken.group.context.instructions).toHaveLength(0);
    expect(oneToken.manager.groupFrameContains(650, 350)).toBe(false);
    expect(oneToken.manager.groupFrameContains(100, 100)).toBe(false);
  });
});
