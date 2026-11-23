import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { MapContentsFade } from '../../../src/app/pixi/levels/MapContentsFade';

describe('MapContentsFade', () => {
  it('fades every layer but the kept ones, and gives each its own alpha back', () => {
    const viewport = new Container();
    const map = viewport.addChild(new Container());
    const tokens = viewport.addChild(new Container());
    const drawings = viewport.addChild(new Container());
    drawings.alpha = 0.6;
    const fade = new MapContentsFade({ viewport, keeps: (layer) => layer === map, requestRender: () => undefined, reducedMotion: () => true });

    fade.out();
    expect([map.alpha, tokens.alpha, drawings.alpha]).toEqual([1, 0, 0]);

    fade.in();
    expect([map.alpha, tokens.alpha, drawings.alpha]).toEqual([1, 1, 0.6]);
  });
});
