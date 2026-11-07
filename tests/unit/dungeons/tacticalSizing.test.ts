import { expect, it } from 'vitest';
import { dungeonParams } from '../../../src/app/dungeons/params';
import { drawSize } from '../../../src/app/dungeons/layout/sizes';
import { stream } from '../../../src/app/dungeons/rng';

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
