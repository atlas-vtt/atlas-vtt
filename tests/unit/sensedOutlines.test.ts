import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { SENSED_OUTLINE_Z_INDEX, SensedOutlines } from '../../src/app/pixi/token-renderer/SensedOutlines';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

describe('SensedOutlines', () => {
  let restore: () => void;
  let outlines: SensedOutlines;

  beforeEach(() => {
    restore = stubJsdomGraphics();
    outlines = new SensedOutlines();
  });

  afterEach(() => {
    outlines.destroy();
    restore();
  });

  /** The outlines on the canvas, without the layer of the held ones. */
  const drawn = (): Graphics[] => outlines.view.children.filter((child) => child !== outlines.heldView) as Graphics[];

  it('is a layer between the lighting and the token UI that shows only once it is switched on and takes no pointer', () => {
    expect(outlines.view.visible).toBe(false);
    expect(outlines.view.eventMode).toBe('none');
    expect(SENSED_OUTLINE_Z_INDEX).toBeGreaterThan(90);
    expect(SENSED_OUTLINE_Z_INDEX).toBeLessThan(100);
    expect(outlines.view.zIndex).toBe(SENSED_OUTLINE_Z_INDEX);
  });

  it('draws one outline per sensed token, at the token and as wide as it', () => {
    outlines.sync([{ id: 'a', x: 100, y: 200, size: 62 }, { id: 'b', x: 300, y: 50, size: 124 }]);
    expect(outlines.shown()).toEqual(['a', 'b']);
    const [a, b] = drawn();
    expect([a!.x, a!.y]).toEqual([100, 200]);
    expect(a!.getLocalBounds().width).toBeGreaterThan(60);
    expect(a!.getLocalBounds().width).toBeLessThan(66);
    expect(b!.getLocalBounds().width).toBeGreaterThan(122);
    expect(b!.getLocalBounds().width).toBeLessThan(128);
  });

  it('moves an outline with its token without drawing it again, and draws it again when the token changes size', () => {
    outlines.sync([{ id: 'a', x: 100, y: 200, size: 62 }]);
    const graphics = drawn()[0]!;
    const instructions = graphics.context.instructions.length;
    outlines.sync([{ id: 'a', x: 140, y: 210, size: 62 }]);
    expect(drawn()[0]).toBe(graphics);
    expect([graphics.x, graphics.y]).toEqual([140, 210]);
    expect(graphics.context.instructions).toHaveLength(instructions);
    outlines.sync([{ id: 'a', x: 140, y: 210, size: 124 }]);
    expect(graphics.getLocalBounds().width).toBeGreaterThan(122);
  });

  it('removes the outline of a token that is no longer sensed', () => {
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62 }, { id: 'b', x: 10, y: 10, size: 62 }]);
    const gone = drawn()[0]!;
    outlines.sync([{ id: 'b', x: 10, y: 10, size: 62 }]);
    expect(outlines.shown()).toEqual(['b']);
    expect(drawn()).toHaveLength(1);
    expect(gone.destroyed).toBe(true);
    outlines.sync([]);
    expect(drawn()).toHaveLength(0);
  });

  it('updates one outline without changing or redrawing another', () => {
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62 }, { id: 'b', x: 10, y: 20, size: 62 }]);
    const [a, b] = drawn();
    const instructions = b!.context.instructions;
    outlines.syncOne('a', { id: 'a', x: 50, y: 60, size: 62 });
    expect(drawn()).toEqual([a, b]);
    expect([a!.x, a!.y]).toEqual([50, 60]);
    expect([b!.x, b!.y]).toEqual([10, 20]);
    expect(b!.context.instructions).toBe(instructions);
    expect(outlines.shown()).toEqual(['a', 'b']);
  });

  it('removes only the requested outline, including a held one', () => {
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62, held: true }, { id: 'b', x: 10, y: 20, size: 62 }]);
    const a = outlines.heldView.children[0]!;
    const b = drawn()[0]!;
    outlines.syncOne('missing', null);
    outlines.syncOne('a', null);
    expect(a.destroyed).toBe(true);
    expect(outlines.heldView.children).toHaveLength(0);
    expect(outlines.shown()).toEqual(['b']);
    expect(drawn()).toEqual([b]);
    expect(b.destroyed).toBe(false);
  });

  it('adds, resizes and reparents a single outline while preserving the others', () => {
    outlines.syncOne('a', { id: 'a', x: 0, y: 0, size: 62 });
    const a = drawn()[0]!;
    outlines.syncOne('b', { id: 'b', x: 10, y: 20, size: 62 });
    const b = drawn()[1]!;
    outlines.syncOne('a', { id: 'a', x: 30, y: 40, size: 124, held: true });
    expect(outlines.heldView.children).toEqual([a]);
    expect(drawn()).toEqual([b]);
    expect(a.getLocalBounds().width).toBeGreaterThan(122);
    expect([a.x, a.y]).toEqual([30, 40]);
    outlines.syncOne('a', { id: 'a', x: 30, y: 40, size: 124 });
    expect(a.parent).toBe(outlines.view);
    expect(outlines.heldView.children).toHaveLength(0);
    expect(outlines.shown()).toEqual(['a', 'b']);
  });

  it('keeps the outline of a token the pointer holds apart, for the players\' frame alone', () => {
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62 }, { id: 'b', x: 10, y: 10, size: 62, held: true }]);
    expect(outlines.heldView.visible).toBe(false);
    expect(outlines.heldView.parent).toBe(outlines.view);
    expect(outlines.heldView.children).toHaveLength(1);
    expect(outlines.view.children.filter((child) => child !== outlines.heldView)).toHaveLength(1);
    const held = outlines.heldView.children[0];
    // Released, it joins the others; taken, another one leaves them.
    outlines.sync([{ id: 'a', x: 0, y: 0, size: 62, held: true }, { id: 'b', x: 10, y: 10, size: 62 }]);
    expect(outlines.heldView.children).toHaveLength(1);
    expect(outlines.heldView.children[0]).not.toBe(held);
    expect(held!.parent).toBe(outlines.view);
    expect(outlines.shown()).toEqual(['a', 'b']);
  });
});
