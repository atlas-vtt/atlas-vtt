import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const op = (id: string, timestamp: number): FogOperation => ({
  id, kind: 'fog', type: 'rectangle', timestamp, isErasing: false, x: 0, y: 0, width: 10, height: 10,
});

interface Entry { opCanvas: object; paintOp: FogOperation }
type Internals = { fogSprites: Map<string, Entry>; rebuildFogSprites: () => void };
type FogRecords = Record<string, FogOperation>;

let restoreGraphics: (() => void) | null = null;
afterEach(() => { restoreGraphics?.(); restoreGraphics = null; vi.restoreAllMocks(); });

function makeRenderer(): { renderer: FogOfWarRenderer; internals: Internals; show: (fog: FogRecords) => void } {
  restoreGraphics = stubJsdomGraphics();
  const store = createStore<{ objects: { fog: FogRecords } } & Record<string, unknown>>(() => ({
    isPlayerView: false, isGMView: true, isMapLoading: false, activeTool: 'select', mapPath: 'map', objects: { fog: {} },
  }));
  const renderer = new FogOfWarRenderer(new Container() as never, { canvas: createEl('canvas') } as never, new EventEmitter(), store as never);
  const internals = renderer as unknown as Internals;
  const show = (fog: FogRecords): void => {
    store.setState({ objects: { fog } });
    internals.rebuildFogSprites();
  };
  return { renderer, internals, show };
}

const byId = (...ops: FogOperation[]): FogRecords => Object.fromEntries(ops.map((o) => [o.id, o]));
const erase = (id: string, timestamp: number): FogOperation => ({ ...op(id, timestamp), isErasing: true });

describe('FogOfWarRenderer sprites', () => {
  it('an operation whose canvas would come out the same is kept', () => {
    const { renderer, internals, show } = makeRenderer();
    const a = op('a', 1);
    const b = op('b', 2);
    show(byId(a, b));
    const kept = internals.fogSprites.get('a')?.opCanvas;
    const changed = internals.fogSprites.get('b')?.opCanvas;
    expect(kept).toBeDefined();
    // Only `b` changes: `a` is the same record, so its canvas is not drawn again.
    show(byId(a, { ...b, width: 20 }));
    expect(internals.fogSprites.get('a')?.opCanvas).toBe(kept);
    expect(internals.fogSprites.get('b')?.opCanvas).not.toBe(changed);
    renderer.destroy();
  });

  it('an operation is drawn again once a later erase cuts into it', () => {
    const { renderer, internals, show } = makeRenderer();
    const a = op('a', 1);
    show(byId(a));
    const before = internals.fogSprites.get('a')?.opCanvas;
    show(byId(a, erase('e', 2)));
    expect(internals.fogSprites.get('a')?.opCanvas).not.toBe(before);
    renderer.destroy();
  });

  it('an erase from before the operation does not redraw it', () => {
    const { renderer, internals, show } = makeRenderer();
    const a = op('a', 5);
    show(byId(a));
    const before = internals.fogSprites.get('a')?.opCanvas;
    show(byId(a, erase('e', 2)));
    expect(internals.fogSprites.get('a')?.opCanvas).toBe(before);
    renderer.destroy();
  });
});
