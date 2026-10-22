import { LIVE_INTERVAL_MS, parseGmMessage, type LiveMessage, type SharedToken } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { LiveShare } from '../../../../src/app/online/gm/LiveShare.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { CARRY_MS } from '../../../../src/app/online/gm/LiveShare.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { sceneState, shareHarness, token, tokenLists, type ShareHarness } from './shareHarness.ts';

const ART = new Map([
  ['maps/cave.webp', new Uint8Array([1, 2, 3])],
  ...['a', 'b', 'c', 'd', 'e'].map((id) => [`art/${id}.webp`, new Uint8Array([4, 5, 6])] as const),
]);

type Tokens = ReturnType<typeof token>[];

const scene = (tokens: Tokens, held: readonly string[] = []): ReturnType<typeof sceneState> => sceneState({
  heldTokens: Object.fromEntries(held.map((id) => [id, { x: 0, y: 0 }])),
  objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) },
});

async function started(tokens: Tokens): Promise<ShareHarness> {
  const table = shareHarness(scene(tokens), ART);
  table.share.start();
  await table.set(scene(tokens));
  await table.advance(TOKEN_INTERVAL_MS);
  return table;
}

const lives = (table: ShareHarness): LiveMessage[] => table.sent.flatMap(({ body }) => (body.t === 'live' ? [body] : []));
/** The id players know a token by, from the last list they got that holds it at `x`. */
const aliasAt = (table: ShareHarness, x: number): string | undefined => tokenLists(table.sent).flatMap((list) => list.tokens).find((entry) => entry.x === x)?.id;

describe('the live lane of a drag', () => {
  it('sends where a held token is about 30 times a second, read when it goes, and ends it on release', async () => {
    const table = await started([token('a', { x: 100 }), token('b', { x: 500 })]);
    const alias = aliasAt(table, 100);
    for (let step = 1; step <= 30; step += 1) {
      await table.set(scene([token('a', { x: 100 + step * 2.005 }), token('b', { x: 500 })], ['a']));
      await table.advance(10);
    }
    await table.set(scene([token('a', { x: 170 }), token('b', { x: 500 })]));
    await table.advance(LIVE_INTERVAL_MS);
    const sent = lives(table);
    expect(sent.length).toBeGreaterThanOrEqual(Math.floor(300 / LIVE_INTERVAL_MS));
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(300 / LIVE_INTERVAL_MS) + 2);
    expect(sent.every((message) => message.tokens.every((place) => place.id === alias))).toBe(true);
    // Let go of where the players see it: the drag ends where it was dropped, as the list lands it.
    expect(sent.flatMap((message) => message.tokens).filter((place) => place.end === true)).toEqual([{ id: alias, x: 170, y: 100, end: true }]);
    expect(sent.at(-1)?.tokens).toEqual([{ id: alias, x: 170, y: 100, end: true }]);
    expect(sent.every((message) => parseGmMessage(JSON.parse(JSON.stringify(message))) !== null)).toBe(true);
    expect(sent.map((message) => message.at)).toEqual([...sent.map((message) => message.at)].sort((x, y) => x - y));
  });

  it('keeps a dragged token in the list where it was listed while the lane carries it, and lands it there with the drop', async () => {
    const table = await started([token('a', { x: 100 }), token('b', { x: 500 })]);
    const alias = aliasAt(table, 100);
    const listsBefore = tokenLists(table.sent).length;
    for (let step = 1; step <= 30; step += 1) {
      await table.set(scene([token('a', { x: 100 + step * 2 }), token('b', { x: 500 })], ['a']));
      await table.advance(10);
    }
    const during = tokenLists(table.sent).slice(listsBefore);
    // At most the list of the drag's first step, before the lane carried it: then the lane alone tells the drag.
    expect(during.length).toBeLessThanOrEqual(1);
    const placeDuring = tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.id === alias)?.x;
    expect(placeDuring).toBeLessThanOrEqual(102);
    expect(lives(table).at(-1)?.tokens).toEqual([{ id: alias, x: 160, y: 100 }]);
    await table.set(scene([token('a', { x: 170 }), token('b', { x: 500 })]));
    await table.advance(TOKEN_INTERVAL_MS + LIVE_INTERVAL_MS);
    expect(tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.id === alias)?.x).toBe(170);
    expect(lives(table).at(-1)?.tokens).toEqual([{ id: alias, x: 170, y: 100, end: true }]);
  });

  it('lands a drag that rests in the list before a page would give it up, for the players watching and for one who joins', async () => {
    const table = await started([token('a', { x: 100 }), token('b', { x: 500 })]);
    const alias = aliasAt(table, 100);
    for (let step = 1; step <= 10; step += 1) {
      await table.set(scene([token('a', { x: 100 + step * 5 }), token('b', { x: 500 })], ['a']));
      await table.advance(LIVE_INTERVAL_MS);
    }
    const listedX = (): number | undefined => tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.id === alias)?.x;
    expect(listedX()).toBeLessThan(150);
    const lastLive = lives(table).length;
    // Still held, resting: the lane tells the same place now and then, and the list lands it before a page would give it up (1.5 s).
    await table.advance(CARRY_MS + TOKEN_INTERVAL_MS + 10);
    expect(lives(table).slice(lastLive).flatMap((message) => message.tokens)).toEqual(Array.from({ length: lives(table).length - lastLive }, () => ({ id: alias, x: 150, y: 100 })));
    expect(listedX()).toBe(150);
    const before = table.sent.length;
    table.share.resend('joiner');
    await table.advance(1);
    const joined = tokenLists(table.sent.slice(before).filter(({ to }) => to === 'joiner')).at(-1);
    expect(joined?.tokens.find((entry) => entry.id === alias)?.x).toBe(150);
    // Moving again: once the lane tells the drag again, the list keeps the place it has.
    await table.set(scene([token('a', { x: 180 }), token('b', { x: 500 })], ['a']));
    await table.advance(LIVE_INTERVAL_MS);
    const kept = listedX();
    await table.set(scene([token('a', { x: 210 }), token('b', { x: 500 })], ['a']));
    await table.advance(LIVE_INTERVAL_MS);
    expect(listedX()).toBe(kept);
    expect(lives(table).at(-1)?.tokens).toEqual([{ id: alias, x: 210, y: 100 }]);
  });

  it('ends a drag let go of where it was dropped at once in the list, however soon after another list', async () => {
    const table = await started([token('a', { x: 100 }), token('b', { x: 500 })]);
    const alias = aliasAt(table, 100);
    for (let step = 1; step <= 5; step += 1) {
      await table.set(scene([token('a', { x: 100 + step * 10 }), token('b', { x: 500 })], ['a']));
      await table.advance(LIVE_INTERVAL_MS);
    }
    // Another token changes just before the drop, so a list went out a moment ago.
    await table.set(scene([token('a', { x: 150 }), token('b', { x: 510 })], ['a']));
    await table.advance(5);
    const before = table.sent.length;
    await table.set(scene([token('a', { x: 155 }), token('b', { x: 510 })]));
    await table.advance(1);
    expect(tokenLists(table.sent).at(-1)?.tokens.find((entry) => entry.id === alias)?.x).toBe(155);
    await table.advance(LIVE_INTERVAL_MS);
    const ended = lives(table).flatMap((message) => message.tokens).filter((place) => place.end === true);
    expect(ended).toEqual([{ id: alias, x: 155, y: 100, end: true }]);
    expect(table.sent.slice(before).some(({ body }) => body.t === 'delta' || body.t === 'tokens')).toBe(true);
  });

  it('never carries a hidden token, one the players do not see, or one not in their list yet', async () => {
    const table = await started([token('a', { x: 100 }), token('b', { x: 200, isHidden: true })]);
    table.perception = (id) => (id === 'c' ? 'sensed' : 'seen');
    for (let step = 1; step <= 10; step += 1) {
      await table.set(scene([token('a', { x: 100 + step }), token('b', { x: 200 + step, isHidden: true }), token('c', { x: 300 + step })], ['a', 'b', 'c']));
      await table.advance(LIVE_INTERVAL_MS);
    }
    const alias = aliasAt(table, 100);
    expect(lives(table).flatMap((message) => message.tokens).every((place) => place.id === alias)).toBe(true);
  });

  it('ends a token that leaves the players\' sight where they last saw it, and says no more of it', async () => {
    const table = await started([token('a', { x: 100 })]);
    const alias = aliasAt(table, 100);
    for (let step = 1; step <= 20; step += 1) {
      if (step === 10) table.perception = () => 'unseen';
      await table.set(scene([token('a', { x: 100 + step * 10 })], ['a']));
      await table.advance(LIVE_INTERVAL_MS);
    }
    const places = lives(table).flatMap((message) => message.tokens);
    const end = places.findIndex((place) => place.end === true);
    expect(places[end]).toEqual({ id: alias, x: 190, y: 100, end: true });
    expect(places.slice(end + 1)).toEqual([]);
    expect(Math.max(...places.map((place) => place.x))).toBe(190);
  });

  it('tells a player who joins in the middle of a drag nothing of it: they get the lists, and the next live message like everyone', async () => {
    const table = await started([token('a', { x: 100 })]);
    for (let step = 1; step <= 5; step += 1) {
      await table.set(scene([token('a', { x: 100 + step * 10 })], ['a']));
      await table.advance(LIVE_INTERVAL_MS);
    }
    const before = table.sent.length;
    table.share.resend('joiner');
    await table.advance(1);
    const toJoiner = table.sent.slice(before);
    expect(toJoiner.length).toBeGreaterThan(0);
    // Everything a join brings goes to the joiner alone and is a list or a scene, never a live message: none is kept to send again.
    expect(toJoiner.every(({ body, to }) => to === 'joiner' && body.t !== 'live')).toBe(true);
    await table.set(scene([token('a', { x: 160 })], ['a']));
    await table.advance(LIVE_INTERVAL_MS);
    expect(lives(table).at(-1)?.tokens).toEqual([{ id: aliasAt(table, 100), x: 160, y: 100 }]);
  });

  it('holds nothing back a list would not show, whatever the drags, hides and sight do (seeded)', async () => {
    for (let trial = 0; trial < 20; trial += 1) {
      let seed = trial + 1;
      const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const ids = ['a', 'b', 'c', 'd', 'e'];
      let tokens = ids.map((id, index) => token(id, { x: 100 + index * 100, y: 100 }));
      const table = await started(tokens);
      let unseen = new Set<string>();
      const lastPlace = new Map<string, { x: number; y: number }>();
      table.perception = (id) => (unseen.has(id) ? 'unseen' : 'seen');
      for (let step = 0; step < 60; step += 1) {
        const held = ids.filter(() => random() < 0.4);
        if (random() < 0.2) unseen = new Set(ids.filter(() => random() < 0.3));
        tokens = tokens.map((entry) => ({ ...entry, x: entry.x + (random() - 0.5) * 40, ...(random() < 0.1 && { isHidden: !entry.isHidden }) }));
        const before = table.sent.length;
        await table.set(scene(tokens, held));
        await table.advance(5 + random() * 40);
        // Every place sent now is of a token in the players' last list that their picture shows, where the GM has it;
        // an end is where a token let go of that they see stands, else the last place sent of that token.
        const listed = (table.share as unknown as { tokens: { listedToken(alias: string): string | undefined } }).tokens;
        const inList = new Set(tokenLists(table.sent).at(-1)?.tokens.map((entry: SharedToken) => entry.id));
        for (const message of table.sent.slice(before).flatMap(({ body }) => (body.t === 'live' ? [body] : []))) {
          for (const place of message.tokens) {
            const at = `trial ${trial} step ${step}`;
            if (place.end === true) {
              const ended = tokens.find((entry) => entry.id === listed.listedToken(place.id));
              const dropped = ended !== undefined && !held.includes(ended.id) && ended.isHidden !== true && !unseen.has(ended.id);
              expect(dropped ? { x: Math.round(ended.x * 100) / 100, y: ended.y } : lastPlace.get(place.id), at).toEqual({ x: place.x, y: place.y });
              lastPlace.delete(place.id);
              continue;
            }
            const gm = tokens.find((entry) => entry.id === listed.listedToken(place.id));
            expect(inList.has(place.id), at).toBe(true);
            expect(gm === undefined || gm.isHidden === true || unseen.has(gm.id), at).toBe(false);
            expect([Math.round((gm?.x ?? 0) * 100) / 100, gm?.y], at).toEqual([place.x, place.y]);
            lastPlace.set(place.id, { x: place.x, y: place.y });
          }
        }
      }
    }
  });
});

describe('live messages that wait', () => {
  /** A LiveShare over tokens `a` and `b` whose state each step replaces, 40 ms apart; returns each message with the key it waits under. */
  function stepped(steps: readonly ReturnType<typeof sceneState>[]): { readonly key: string; readonly message: LiveMessage }[] {
    let state = steps[0] ?? scene([]);
    let now = 0;
    const sent: { key: string; message: LiveMessage }[] = [];
    const live = new LiveShare({ getState: () => state, setState: () => undefined, subscribe: () => () => undefined }, {
      sendLive: (body, key) => void (body.t === 'live' && sent.push({ key, message: body })),
      tokenSource: () => fakeTokenSource(() => state, () => undefined, () => 70),
      now: () => now,
      setTimer: () => 0,
      clearTimer: () => undefined,
    }, () => ({ scene: 's', alias: (id) => id.repeat(24) }));
    live.setScene({ id: 's', lit: false });
    for (const step of steps) {
      state = step;
      now += 40;
      live.update();
    }
    return sent;
  }

  it('hold every held token, so the newest may replace one that waits; an end waits under a key nothing replaces', () => {
    const sent = stepped([
      scene([token('a', { x: 100 }), token('b', { x: 500 })], ['a', 'b']),
      // Only `a` moves: `b` is in the message all the same, or a message replaced while it waits would lose `b`'s place.
      scene([token('a', { x: 110 }), token('b', { x: 500 })], ['a', 'b']),
      // `b` is let go: its end goes once, with `a`'s place.
      scene([token('a', { x: 120 }), token('b', { x: 500 })], ['a']),
      scene([token('a', { x: 130 }), token('b', { x: 500 })], ['a']),
      scene([token('a', { x: 130 }), token('b', { x: 500 })]),
    ]);
    const a = 'a'.repeat(24);
    const b = 'b'.repeat(24);
    expect(sent.map(({ message }) => message.tokens)).toEqual([
      [{ id: a, x: 100, y: 100 }, { id: b, x: 500, y: 100 }],
      [{ id: a, x: 110, y: 100 }, { id: b, x: 500, y: 100 }],
      [{ id: a, x: 120, y: 100 }, { id: b, x: 500, y: 100, end: true }],
      [{ id: a, x: 130, y: 100 }],
      [{ id: a, x: 130, y: 100, end: true }],
    ]);
    const keys = sent.map(({ key }) => key);
    // Messages of places share the scene's key (the latest wins); each message with an end has its own.
    expect([keys[0], keys[1], keys[3]]).toEqual(['s', 's', 's']);
    expect(new Set([keys[2], keys[4], 's']).size).toBe(3);
  });

  it('say nothing while no held token moves', () => {
    const still = scene([token('a', { x: 100 })], ['a']);
    expect(stepped([still, still, still])).toHaveLength(1);
  });
});

describe('the live lane of the GM\'s own drag', () => {
  /** A LiveShare over one held token `a` (alias `aa…`) whose sprite the GM's canvas draws 30 px ahead of the store. */
  function gmDrag(lit: boolean, changes: Partial<ReturnType<typeof token>>, lighting: ReturnType<typeof sceneState>['lighting'] = { enabled: lit, ambient: 1 }): LiveMessage[] {
    const state = { ...scene([token('a', { x: 100, ...changes })], ['a']), isDragging: true, lighting };
    const sent: LiveMessage[] = [];
    const live = new LiveShare({ getState: () => state, setState: () => undefined, subscribe: () => () => undefined }, {
      sendLive: (body) => void (body.t === 'live' && sent.push(body)),
      tokenSource: () => fakeTokenSource(() => state, () => undefined, () => 70),
      drawnPlaces: (ids) => new Map(ids.map((id) => [id, { x: 130, y: 100 }])),
      now: () => 0,
      setTimer: () => 0,
      clearTimer: () => undefined,
    }, () => ({ scene: 's', alias: () => 'a'.repeat(24) }));
    live.setScene({ id: 's', lit });
    live.update();
    return sent;
  }

  it('takes the place the GM\'s canvas draws where players\' sight was asked about it, else the store\'s', () => {
    const seeing = { vision: { enabled: true } };
    expect(gmDrag(false, {})[0]?.tokens[0]?.x).toBe(130);
    expect(gmDrag(true, seeing)[0]?.tokens[0]?.x).toBe(130);
    expect(gmDrag(true, {})[0]?.tokens[0]?.x).toBe(100);
    expect(gmDrag(true, seeing, { enabled: true, ambient: 1, sightOnDrop: true })[0]?.tokens[0]?.x).toBe(100);
  });
});
