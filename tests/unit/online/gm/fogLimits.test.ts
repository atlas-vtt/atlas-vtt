import { MAX_FOG_OPERATIONS, MAX_FOG_POINTS, parseFog } from '../../../../src/app/online/protocol/index.ts';
import { fogPastLimits, sharedFog } from '../../../../src/app/online/gm/sceneInputs.ts';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import { describe, expect, it } from 'vitest';
import { sceneState, sequenced, shareHarness } from './shareHarness.ts';

const TOO_MUCH = 'This map has too much fog for online players. They see it covered until you clear some.';
const alias = (key: string): string => key.padStart(24, '0').slice(-24).replace(/[^0-9a-f]/g, '0');

const rectangle = (id: string, timestamp: number): FogOperation => ({ id, kind: 'fog', timestamp, isErasing: false, type: 'rectangle', x: timestamp % 900, y: 0, width: 50, height: 50 });
/** `count` rectangles, each a tick after the one before. */
function rectangles(count: number): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = {};
  for (let index = 0; index < count; index += 1) fog[`r${index}`] = rectangle(`r${index}`, index + 1);
  return fog;
}
/** One lasso round a circle with `count` corners: twice as many numbers on the wire. */
function lasso(count: number): FogOperation {
  const points = Array.from({ length: count }, (_, index) => ({ x: 500 + 400 * Math.cos((index / count) * 2 * Math.PI), y: 500 + 400 * Math.sin((index / count) * 2 * Math.PI) }));
  return { id: 'lasso', kind: 'fog', timestamp: 1, isErasing: false, type: 'lasso', points };
}

describe('fog that is more than players can be sent', () => {
  it('goes out whole up to as many operations as a message may carry, and as unreadable past them', () => {
    const most = rectangles(MAX_FOG_OPERATIONS);
    expect(fogPastLimits(most)).toBe(false);
    const sent = sharedFog(most, alias);
    expect(sent).toHaveLength(MAX_FOG_OPERATIONS);
    // What goes out is what a player's page reads.
    expect(parseFog(JSON.parse(JSON.stringify(sent)))).toHaveLength(MAX_FOG_OPERATIONS);

    const over = { ...most, last: rectangle('last', MAX_FOG_OPERATIONS + 1) };
    expect(fogPastLimits(over)).toBe(true);
    expect(sharedFog(over, alias)).toBeNull();
    // Unreadable fog covers the players' whole map; the operations themselves they would refuse, and show none.
    expect(parseFog(null)).toBeNull();
    expect(parseFog(Object.values(over).map(({ id: _id, kind: _kind, timestamp: _timestamp, isErasing, ...shape }) => ({ ...shape, erase: isErasing })))).toBeUndefined();
  });

  it('goes out whole up to as many points as a message may carry, and as unreadable past them', () => {
    const most = { lasso: lasso(MAX_FOG_POINTS / 2) };
    expect(fogPastLimits(most)).toBe(false);
    const sent = sharedFog(most, alias);
    expect(sent).toHaveLength(1);
    expect(parseFog(sent)).toHaveLength(1);

    // One corner more, in another operation: the points of all count together.
    const over = { ...most, brush: { id: 'brush', kind: 'fog', timestamp: 2, isErasing: true, type: 'brush', points: [{ x: 10, y: 10 }], brushRadius: 20 } satisfies FogOperation };
    expect(fogPastLimits(over)).toBe(true);
    expect(sharedFog(over, alias)).toBeNull();
    expect(sharedFog({ lasso: lasso(MAX_FOG_POINTS / 2 + 1) }, alias)).toBeNull();
  });

  it('counts a record that holds entries that are no operations without failing', () => {
    const broken = { none: null, number: 7, text: 'fog', points: { points: 'none' } } as unknown as Record<string, FogOperation>;
    expect(fogPastLimits(broken)).toBe(false);
    expect(sharedFog(broken, alias)).toBeNull();
  });

  it('covers the map for players who join, and tells the GM once until some is cleared', async () => {
    const base = sceneState();
    const withFog = (fog: Record<string, FogOperation>): ReturnType<typeof sceneState> => sceneState({ objects: { ...base.objects, fog } });
    const over = { ...rectangles(MAX_FOG_OPERATIONS), last: rectangle('last', MAX_FOG_OPERATIONS + 1) };
    const table = shareHarness(withFog(over), new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]));
    table.share.start();
    await table.advance(2_000);
    const held = (): unknown => sequenced(table.sent, 'fog').at(-1)?.fog;
    expect(held()).toBeNull();
    expect(table.notices).toEqual([TOO_MUCH]);

    // More fog still: players stay covered, and the GM is not told again.
    await table.set(withFog({ ...over, more: rectangle('more', MAX_FOG_OPERATIONS + 2) }));
    await table.advance(2_000);
    expect(held()).toBeNull();
    expect(table.notices).toEqual([TOO_MUCH]);

    // A player who joins now gets the same: the map covered, never open.
    table.sent.length = 0;
    table.share.resend('ana');
    expect(table.sent.filter(({ body }) => body.t === 'fog').map(({ body, to }) => [body.t === 'fog' ? body.fog : undefined, to])).toEqual([[null, 'ana']]);

    // Some of it cleared: the fog goes out again.
    await table.set(withFog(rectangles(10)));
    await table.advance(2_000);
    expect(sequenced(table.sent, 'fog').at(-1)?.fog).toHaveLength(10);
    expect(table.notices).toEqual([TOO_MUCH]);
    // Past the limit again, the GM is told again.
    await table.set(withFog(over));
    await table.advance(2_000);
    expect(table.notices).toEqual([TOO_MUCH, TOO_MUCH]);
  }, 30_000);
});
