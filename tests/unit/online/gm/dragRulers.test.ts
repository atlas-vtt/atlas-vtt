// @vitest-environment node
import { parseGmMessage, type LivePlace } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { dragRulerPaths } from '../../../../src/app/online/gm/dragRulers.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import type { Perception } from '../../../../src/app/vision/perception';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const ART = new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])], ['art/a.webp', new Uint8Array([4, 5, 6])], ['art/b.webp', new Uint8Array([4, 5, 6])]]);
const ANA = 'a'.repeat(20);
const GRID = { enabled: true, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 1 } as const;
const STEP_MS = 40;

type Tokens = ReturnType<typeof token>[];
const scene = (tokens: Tokens, held: readonly string[] = []): ReturnType<typeof sceneState> => sceneState({
  grid: GRID,
  heldTokens: Object.fromEntries(held.map((id) => [id, { x: 0, y: 0 }])),
  objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) },
});

async function started(tokens: Tokens, seats?: SeatSource): Promise<ShareHarness> {
  const table = shareHarness(scene(tokens), ART, seats);
  table.share.start();
  await table.set(scene(tokens));
  await table.advance(TOKEN_INTERVAL_MS);
  return table;
}

/** Every place the live lane sent, in order, as a player's page reads it. */
const places = (table: ShareHarness): LivePlace[] => table.sent.flatMap(({ body }) => {
  const read = body.t === 'live' ? parseGmMessage(JSON.parse(JSON.stringify(body))) : null;
  return read?.t === 'live' ? read.tokens : [];
});
const aliasOf = (table: ShareHarness, x: number): string | undefined => tokenLists(table.sent).flatMap((list) => list.tokens).find((entry) => entry.x === x)?.id;
const sceneId = (table: ShareHarness): string => tokenLists(table.sent).at(-1)?.scene ?? '';

interface GmDrag {
  /** How the dragged token `a` differs from a plain one. */
  readonly a?: Parameters<typeof token>[1];
  readonly others?: Tokens;
  readonly steps?: number;
  /** Runs before each step. */
  readonly during?: (step: number) => void;
}

/** The GM drags token `a` from (35, 35) to the right, a cell a step (four by default), as Atlas's ruler measures it, and drops it. */
async function gmDrag(table: ShareHarness, { a = {}, others = [], steps = 4, during = () => undefined }: GmDrag = {}): Promise<void> {
  for (let step = 1; step <= steps; step += 1) {
    during(step);
    table.gmRuler = { tokenId: 'a', points: [{ x: 35, y: 35 }, { x: 35 + step * 70, y: 35 }] };
    await table.set(scene([token('a', { ...a, x: 35 + step * 70, y: 35 }), ...others], ['a']));
    await table.advance(STEP_MS);
  }
  table.gmRuler = null;
  await table.set(scene([token('a', { ...a, x: 35 + steps * 70, y: 35 }), ...others]));
  await table.advance(STEP_MS);
}

describe('the rulers of drags, as players get them', () => {
  it('sends the GM\'s ruler with the token it measures while the players see it, and ends it with the drag', async () => {
    const table = await started([token('a', { x: 35, y: 35 })]);
    const alias = aliasOf(table, 35);
    await gmDrag(table);
    const sent = places(table);
    expect(sent.every((place) => place.id === alias)).toBe(true);
    expect(sent.filter((place) => place.path !== undefined).at(-1)).toEqual({ id: alias, x: 315, y: 35, path: [[35, 35], [315, 35]] });
    expect(sent.at(-1)).toEqual({ id: alias, x: 315, y: 35, end: true });
  });

  it('sends a waypoint the GM adds while the token rests', async () => {
    const table = await started([token('a', { x: 35, y: 35 })]);
    table.gmRuler = { tokenId: 'a', points: [{ x: 35, y: 35 }, { x: 175, y: 35 }] };
    await table.set(scene([token('a', { x: 175, y: 35 })], ['a']));
    await table.advance(STEP_MS);
    await table.set(scene([token('a', { x: 175, y: 35 })], ['a']));
    await table.advance(STEP_MS);
    table.gmRuler = { tokenId: 'a', points: [{ x: 35, y: 35 }, { x: 175, y: 35 }, { x: 175, y: 105.004 }] };
    await table.set(scene([token('a', { x: 175, y: 35 })], ['a']));
    await table.advance(STEP_MS);
    expect(places(table).at(-1)?.path).toEqual([[35, 35], [175, 35], [175, 105]]);
  });

  it('never sends the ruler of a hidden token or of one the players do not see, nor of one under fog', async () => {
    const hidden = await started([token('a', { x: 35, y: 35, isHidden: true }), token('b', { x: 600, y: 600 })]);
    await gmDrag(hidden, { a: { isHidden: true }, others: [token('b', { x: 600, y: 600 })] });
    expect(places(hidden)).toEqual([]);
    for (const perception of ['unseen', 'sensed'] as const satisfies readonly Perception[]) {
      const table = await started([token('a', { x: 35, y: 35 })]);
      table.perception = () => perception;
      await gmDrag(table);
      expect(places(table).filter((place) => place.end !== true)).toEqual([]);
    }
  });

  it('sends the ruler of a drag that began out of sight once the token comes into view, as Atlas\'s player window shows it', async () => {
    const table = await started([token('a', { x: 35, y: 35 })]);
    table.perception = () => 'unseen';
    await gmDrag(table, {
      steps: 20,
      during: (step) => {
        if (step === 3) table.perception = undefined;
      },
    });
    const sent = places(table).filter((place) => place.end !== true);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.at(-1)?.path).toEqual([[35, 35], [35 + 20 * 70, 35]]);
    // Before the token came into view nothing of it went out, its ruler included.
    expect(Math.min(...sent.map((place) => place.x))).toBeGreaterThanOrEqual(35 + 3 * 70);
  });

  it('stops sending the ruler once the token leaves the players\' sight', async () => {
    const table = await started([token('a', { x: 35, y: 35 })]);
    await gmDrag(table, {
      during: (step) => {
        if (step === 3) table.perception = () => 'unseen';
      },
    });
    const sent = places(table);
    const end = sent.findIndex((place) => place.end === true);
    expect(sent.slice(0, end).some((place) => place.path !== undefined)).toBe(true);
    expect(sent.slice(end + 1)).toEqual([]);
  });
});

describe('the rulers of players\' drags', () => {
  const seats: SeatSource = { onlinePlayers: () => [ANA], ownerOf: (id) => (id === 'a' ? ANA : undefined), claimOf: () => 'taken' };

  it('show for the GM and go to the players, snapped as Atlas\'s ruler snaps them, until the drop', async () => {
    const table = await started([token('a', { x: 35, y: 35 })], seats);
    const alias = aliasOf(table, 35) ?? '';
    for (const x of [100, 160, 230]) {
      table.share.receive(ANA, { t: 'drag', scene: sceneId(table), id: alias, x, y: 40 });
      await table.advance(STEP_MS);
    }
    expect(table.playerDrags.at(-1)).toEqual([{ key: 'a', path: [{ x: 35, y: 35 }, { x: 245, y: 35 }], cells: 1, snaps: true }]);
    expect(places(table).filter((place) => place.path !== undefined).at(-1)?.path).toEqual([[35, 35], [245, 35]]);
    table.share.receive(ANA, { t: 'move', scene: sceneId(table), id: alias, x: 245, y: 35 });
    await table.advance(STEP_MS);
    expect(table.playerDrags.at(-1)).toEqual([]);
    expect(places(table).at(-1)).toMatchObject({ id: alias, end: true });
  });
});

describe('dragRulerPaths', () => {
  const state = scene([token('a', { x: 300, y: 40, size: 1.5 }), token('b', { x: 105, y: 105 })]);

  it('measures a player\'s drag from the cell it was taken from to the one the token would land on', () => {
    // A 2×2 token snaps to where cells meet.
    expect(dragRulerPaths(state, null, new Map([['a', { x: 70, y: 70 }]]))).toEqual(new Map([['a', [{ x: 70, y: 70 }, { x: 280, y: 70 }]]]));
  });

  it('leaves out a drag that has not left its cell, and keeps the GM\'s own ruler as Atlas measures it', () => {
    const gm = { tokenId: 'a', points: [{ x: 0, y: 0 }, { x: 1, y: 2 }] };
    expect(dragRulerPaths(state, gm, new Map([['b', { x: 100, y: 110 }]]))).toEqual(new Map([['a', gm.points]]));
  });

  it('does not snap where tokens do not', () => {
    const free = { ...state, grid: { ...GRID, snapToGrid: false } };
    expect(dragRulerPaths(free, null, new Map([['b', { x: 10, y: 20 }]]))).toEqual(new Map([['b', [{ x: 10, y: 20 }, { x: 105, y: 105 }]]]));
  });
});
