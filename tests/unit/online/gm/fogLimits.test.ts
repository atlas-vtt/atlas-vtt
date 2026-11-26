import { MAX_FOG_OPERATIONS, parseFog, type SharedFog, type SharedFogOperation } from '../../../../src/app/online/protocol/index.ts';
import { FOLD_AFTER, SharedFogLog } from '../../../../src/app/online/gm/sharedFogLog.ts';
import { fogCoverage } from '../../../../src/app/fog/fogCoverage';
import { inflateShape, subtractShapes } from '../../../../src/app/lighting/polygonClip';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { Q_SCALE, type QShape } from '../../../../src/app/types/shapeTypes';
import { describe, expect, it } from 'vitest';
import { sceneState, sequenced, shareHarness } from './shareHarness.ts';

let ids = 0;
const alias = (): string => (ids++).toString(16).padStart(24, '0');

type Fog = Record<string, FogOperation>;
const rectangle = (id: string, timestamp: number, x: number, y: number, size = 50): FogOperation => ({ id, kind: 'fog', timestamp, isErasing: false, type: 'rectangle', x, y, width: size, height: size });

/** The map covered, then a party walking a winding path clearing a disc round each step, one lasso a step. */
function walked(steps: number): Fog {
  const fog: Fog = { cover: rectangle('cover', 0, 0, 0, 6000) };
  for (let step = 0; step < steps; step += 1) {
    const cx = 300 + (step * 7) % 5400;
    const cy = 300 + 2000 * Math.sin(step / 40) + 2000;
    const points = Array.from({ length: 48 }, (_, i) => ({ x: cx + 150 * Math.cos((i / 48) * 2 * Math.PI), y: cy + 150 * Math.sin((i / 48) * 2 * Math.PI) }));
    fog[`step${step}`] = { id: `step${step}`, kind: 'fog', timestamp: step + 1, isErasing: true, type: 'lasso', points };
  }
  return fog;
}

/** The fog a player's page replays from what it was sent, as `apps/play`'s `fogOperations` builds it. */
function replayed(sent: readonly SharedFogOperation[]): QShape {
  const record: Fog = {};
  sent.forEach((shared, index) => {
    const base = { id: `f${index}`, kind: 'fog' as const, timestamp: index, isErasing: shared.erase };
    const points = shared.type === 'rectangle' ? [] : Array.from({ length: shared.points.length / 2 }, (_, i) => ({ x: shared.points[i * 2]!, y: shared.points[i * 2 + 1]! }));
    record[`f${index}`] = shared.type === 'rectangle' ? { ...base, type: 'rectangle', x: shared.x, y: shared.y, width: shared.width, height: shared.height }
      : shared.type === 'brush' ? { ...base, type: 'brush', points, brushRadius: shared.radius } : { ...base, type: 'lasso', points };
  });
  return fogCoverage(record).shape;
}

function expectSameFog(sent: SharedFog, fog: Fog): void {
  expect(sent).not.toBeNull();
  // What goes out is what a player's page reads, and replays to the GM's own fog: a fold rounds
  // crossings in another order, so it may differ by slivers, never by half a pixel's width.
  expect(parseFog(JSON.parse(JSON.stringify(sent)))).toHaveLength(sent!.length);
  const players = replayed(sent!);
  const gm = fogCoverage(fog).shape;
  const sliver = (shape: QShape): QShape => inflateShape(shape, -Q_SCALE / 4);
  expect(sliver(subtractShapes(players, gm))).toEqual([]);
  expect(sliver(subtractShapes(gm, players))).toEqual([]);
}

describe('the fog players are sent', () => {
  it('is every operation by itself while the log is short', () => {
    const fog = walked(20);
    const sent = new SharedFogLog().shared(fog, alias);
    expect(sent).toHaveLength(21);
    expectSameFog(sent, fog);
  });

  it('is the shape of a long evening of party steps, not its history', () => {
    const fog = walked(1200);
    const log = new SharedFogLog();
    const sent = log.shared(fog, alias);
    expect(log.tooMuch).toBe(false);
    expect(sent!.length).toBeLessThan(FOLD_AFTER.operations);
    expectSameFog(sent, fog);
  }, 60_000);

  it('folds onto the last fold, keeps its ids, and sends what follows it by itself', () => {
    const fog = walked(FOLD_AFTER.operations + 1);
    const log = new SharedFogLog();
    const folded = log.shared(fog, alias)!;
    const more = { ...fog, last: rectangle('last', 10_000, 100, 100) };
    const next = log.shared(more, alias)!;
    expect(next.slice(0, -1)).toEqual(folded);
    expect(next.at(-1)).toMatchObject({ type: 'rectangle' });
    expectSameFog(next, more);
  }, 60_000);

  it('folds anew when an undo reaches past the fold', () => {
    const fog = walked(FOLD_AFTER.operations + 1);
    const log = new SharedFogLog();
    log.shared(fog, alias);
    const { step3: _gone, ...undone } = fog;
    expectSameFog(log.shared(undone, alias), undone);
  }, 60_000);

  it('covers the map where even its shape is more operations than a message carries', () => {
    const specks: Fog = {};
    for (let index = 0; index <= MAX_FOG_OPERATIONS; index += 1) specks[`s${index}`] = rectangle(`s${index}`, index + 1, (index % 100) * 20, Math.floor(index / 100) * 20, 10);
    const log = new SharedFogLog();
    expect(log.shared(specks, alias)).toBeNull();
    expect(log.tooMuch).toBe(true);
  });

  it('covers the map where an operation cannot be read', () => {
    const broken = { none: null, number: 7 } as unknown as Fog;
    expect(new SharedFogLog().shared(broken, alias)).toBeNull();
  });

  it('goes out to players for a long log, and tells the GM nothing', async () => {
    const base = sceneState();
    const table = shareHarness(sceneState({ objects: { ...base.objects, fog: walked(FOLD_AFTER.operations + 1) } }), new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
    table.share.start();
    await table.advance(2_000);
    expect(sequenced(table.sent, 'fog').at(-1)?.fog).toHaveLength(2);
    expect(table.notices).toEqual([]);
  }, 30_000);
});
