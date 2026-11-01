import { expect, it } from 'vitest';
import { dungeonParams } from '../../../src/app/dungeons/params';
import { caveParams, withVeins } from '../../../src/app/dungeons/layout/cavern/caveParams';
import { drawSize } from '../../../src/app/dungeons/layout/sizes';
import { stream } from '../../../src/app/dungeons/rng';

it('gives tactical caves encounter-sized tiers while preserving their larger chambers', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const params = withVeins(caveParams(dungeonParams(['small', 'dry'])), stream(seed, 'cave'));
    const size = drawSize(stream(seed, 'size'), { ...params, roomScale: 'tactical' }, { gargantuan: true, chamber: true });
    expect(['house', 'hall', 'gargantuan']).toContain(size.tier);
    expect(size.width - 2).toBeGreaterThanOrEqual(10);
    expect(size.depth - 2).toBeGreaterThanOrEqual(10);
  }
});

it('keeps the beta cave passage lengths and route chains in tactical mode', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const params = withVeins(caveParams(dungeonParams(['dry'])), stream(seed, 'cave'));
    params.sizeStyles = [2];
    expect(drawSize(stream(seed, 'size'), { ...params, roomScale: 'tactical' })).toEqual(drawSize(stream(seed, 'size'), params));
  }
});

it('keeps the Round tag bias toward square tactical encounter rooms', () => {
  const params = { ...dungeonParams(['round']), roomScale: 'tactical' as const, sizeStyles: [0 as const] };
  let round = 0;
  let plain = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const a = drawSize(stream(seed, 'size'), { ...params, squareRooms: true });
    const b = drawSize(stream(seed, 'size'), { ...params, squareRooms: false });
    if (a.width === a.depth) round++;
    if (b.width === b.depth) plain++;
  }
  expect(round).toBeGreaterThan(plain);
});
