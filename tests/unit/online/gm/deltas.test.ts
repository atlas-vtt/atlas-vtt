import { DeltaReader, parseGmMessage, type GmMessage, type SharedSight, type SharedToken, type SightToken } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { SequencedList } from '../../../../src/app/online/gm/sequencedList.ts';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const TRIALS = 60;
const STEPS = 80;
const HASH = (n: number): string => n.toString(16).padStart(64, '0');
const aliasOf = (n: number): string => n.toString(16).padStart(24, '0');

/** What players read of a message: through JSON and the parser, as a browser gets it. */
const asRead = (body: GmMessage): GmMessage | null => parseGmMessage(JSON.parse(JSON.stringify(body)));

function sharedToken(random: () => number, id: string): SharedToken {
  const claims = ['open', 'taken', null] as const;
  return {
    id, x: Math.round(random() * 4e5) / 100, y: Math.round(random() * 4e5) / 100, size: 70 * (1 + Math.floor(random() * 3)), cells: 1 + Math.floor(random() * 3),
    rotation: Math.floor(random() * 360), art: random() < 0.8 ? { hash: HASH(Math.floor(random() * 5)), size: 100, mime: 'image/webp' } : null,
    name: random() < 0.7 ? `Name ${Math.floor(random() * 9)}` : null, ring: random() < 0.6 ? { colour: '#d4a017', size: 80 } : null, claim: claims[Math.floor(random() * 3)] ?? null,
    badge: random() < 0.3 ? 1 + Math.floor(random() * 3) : null,
    ui: random() < 0.5 ? null : {
      nameplate: random() < 0.5, downed: random() < 0.2,
      bars: random() < 0.6 ? [{ colour: '#dc2626', direction: 'drains', defeats: true, current: Math.floor(random() * 20), max: 20 }] : [],
      conditions: random() < 0.4 ? [{ colour: '#22c55e', glyph: random() < 0.5 ? { kind: 'icon', icon: 'skull' } : { kind: 'text', text: 'P' }, value: random() < 0.5 ? 2 : null }] : [],
    },
  };
}

function sightToken(random: () => number, id: string): SightToken {
  return {
    id, x: Math.round(random() * 4e5) / 100, y: Math.round(random() * 4e5) / 100, size: 1 + Math.floor(random() * 2),
    ...(random() < 0.5 && { rotation: Math.floor(random() * 360) }),
    ...(random() < 0.4 && { vision: { senses: random() < 0.5 ? [{ id: 'darkvision', range: 60 }] : [], ...(random() < 0.3 && { angle: 90 }) } }),
    ...(random() < 0.3 && { light: { bright: 10, dim: 20, color: '#ffcc88' } }),
    ...(random() < 0.2 && { effects: ['blinded' as const] }),
  };
}

/** One step of a list: places move (often), entries change, leave (hidden), come back (shown) or join, and the order changes. */
function step<T extends { readonly id: string; readonly x: number; readonly y: number }>(random: () => number, list: readonly T[], pool: readonly string[], make: (id: string) => T): T[] {
  let next = list.map((entry) => (random() < 0.3 ? { ...entry, x: Math.round(random() * 4e5) / 100, y: Math.round(random() * 4e5) / 100 } : entry));
  next = next.map((entry) => (random() < 0.08 ? make(entry.id) : entry)).filter(() => random() > 0.06);
  for (const id of pool) if (!next.some((entry) => entry.id === id) && random() < 0.05) next.push(make(id));
  if (random() < 0.1) next = [...next].sort(() => random() - 0.5);
  return next;
}

/** Every message a list sends, read by a player who gets them all: each must make exactly the list sent. */
function follows<K extends 'tokens' | 'sight'>(sent: readonly GmMessage[], published: readonly unknown[], of: K): void {
  const reader = new DeltaReader();
  expect(sent).toHaveLength(published.length);
  sent.forEach((body, index) => {
    const read = reader.read(asRead(body) ?? body);
    if (read === null || read === 'gap' || read.t !== of) throw new Error(`message ${index} does not follow on`);
    const content = Object.fromEntries(Object.entries(read).filter(([key]) => !['t', 'scene', 'seq'].includes(key)));
    expect(content, `message ${index}`).toEqual(JSON.parse(JSON.stringify(published[index])));
  });
}

describe('lists sent as deltas', () => {
  it(`make exactly the token list sent, step by step, hidden and shown again, joined and removed (${TRIALS} trials)`, () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(trial);
      const pool = Array.from({ length: 2 + Math.floor(random() * 30) }, (_, index) => aliasOf(index + 1));
      const sent: GmMessage[] = [];
      const list = new SequencedList('tokens', { send: (body) => sent.push(body), now: () => 0 });
      const published: { tokens: SharedToken[]; cell: number; snap: { type: 'square'; size: number; offsetX: number; offsetY: number } | null }[] = [];
      let tokens = pool.filter(() => random() < 0.6).map((id) => sharedToken(random, id));
      for (let index = 0; index < STEPS; index += 1) {
        const cell = random() < 0.05 ? 100 : 70;
        const content = { tokens, cell, snap: random() < 0.05 ? null : { type: 'square' as const, size: cell, offsetX: 0, offsetY: 0 } };
        const before = sent.length;
        list.publish('scene-a', content);
        if (sent.length > before) published.push(content);
        tokens = step(random, tokens, pool, (id) => sharedToken(random, id));
      }
      expect(sent.some((body) => body.t === 'delta'), `trial ${trial}: deltas`).toBe(true);
      follows(sent, published, 'tokens');
    }
  });

  it(`make exactly the sight inputs sent, fields coming and going (${TRIALS} trials)`, () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(1000 + trial);
      const pool = Array.from({ length: 2 + Math.floor(random() * 30) }, (_, index) => aliasOf(index + 1));
      const lightPool = Array.from({ length: 6 }, (_, index) => aliasOf(500 + index));
      const light = (id: string): SharedSight['lights'][number] => ({ id, x: Math.floor(random() * 3000), y: 200, emission: { bright: 10, dim: 20 }, ...(random() < 0.5 && { rotation: 90 }) });
      const sent: GmMessage[] = [];
      const list = new SequencedList('sight', { send: (body) => sent.push(body), now: () => 0 });
      const published: SharedSight[] = [];
      let tokens = pool.filter(() => random() < 0.6).map((id) => sightToken(random, id));
      let lights = lightPool.filter(() => random() < 0.5).map(light);
      for (let index = 0; index < STEPS; index += 1) {
        const held = tokens.filter(() => random() < 0.1).map(({ id, x, y }) => ({ id, x, y }));
        const content: SharedSight = { lighting: { enabled: true, ambient: random() < 0.1 ? 0.5 : 0 }, lights, tokens, held, ...(random() < 0.1 && { blind: true as const }) };
        const before = sent.length;
        list.publish('scene-a', content);
        if (sent.length > before) published.push(content);
        tokens = step(random, tokens, pool, (id) => sightToken(random, id));
        if (random() < 0.2) lights = step(random, lights, lightPool, light);
      }
      expect(sent.some((body) => body.t === 'delta'), `trial ${trial}: deltas`).toBe(true);
      follows(sent, published, 'sight');
    }
  });

  it('go out whole for a new scene, for a resend, and where a delta would be larger', () => {
    const sent: GmMessage[] = [];
    const list = new SequencedList('tokens', { send: (body) => sent.push(body), now: () => 0 });
    const random = seeded(7);
    const many = Array.from({ length: 20 }, (_, index) => sharedToken(random, aliasOf(index + 1)));
    list.publish('scene-a', { tokens: many, cell: 70, snap: null });
    list.publish('scene-a', { tokens: many.map((entry, index) => (index === 3 ? { ...entry, x: entry.x + 1 } : entry)), cell: 70, snap: null });
    // All gone and twenty others come: the delta would name every one twice.
    list.publish('scene-a', { tokens: many.map((_, index) => sharedToken(random, aliasOf(100 + index))), cell: 70, snap: null });
    list.publish('scene-b', { tokens: [], cell: 70, snap: null });
    list.resend('scene-b', 'ana');
    list.resend('scene-a', 'ana');
    expect(sent.map((body) => [body.t, 'seq' in body ? body.seq : undefined])).toEqual([['tokens', 1], ['delta', 2], ['tokens', 3], ['tokens', 4], ['tokens', 4]]);
  });
});

describe('a player that misses a delta', () => {
  it('asks for the whole list, gets it alone at most once a second, and follows on from there', async () => {
    const tokens = { a: token('a', { x: 10 }), b: token('b', { x: 20 }) };
    const table = shareHarness(sceneState({ objects: { ...sceneState().objects, tokens } }), new Map([['maps/cave.webp', new Uint8Array([1])]]));
    table.share.start();
    // The scene goes out once its map is read and hashed, which a busy machine may take a while for.
    for (let wait = 0; wait < 100 && tokenLists(table.sent).length === 0; wait += 1) await table.advance(100);
    const reader = new DeltaReader();
    const listOf = (body: GmMessage): GmMessage | null | 'gap' => reader.read(asRead(body) ?? body);
    const broadcast = (): GmMessage[] => table.sent.filter(({ to, body }) => to === undefined && (body.t === 'tokens' || body.t === 'delta')).map(({ body }) => body);
    for (const body of broadcast()) listOf(body);
    const moveTo = async (x: number): Promise<void> => {
      await table.set(sceneState({ objects: { ...sceneState().objects, tokens: { ...tokens, a: token('a', { x }) } } }));
      await table.advance(100);
    };
    // One delta lost on the way: the next does not follow on.
    const seen = broadcast().length;
    await moveTo(11);
    await moveTo(12);
    const [lost, next] = broadcast().slice(seen);
    expect([lost?.t, next?.t]).toEqual(['delta', 'delta']);
    expect(listOf(next as GmMessage)).toBe('gap');

    const scene = tokenLists(table.sent).at(-1)?.scene ?? '';
    table.sent.length = 0;
    table.share.receive('ana', { t: 'resync', scene, of: 'tokens' });
    table.share.receive('ana', { t: 'resync', scene, of: 'tokens' });
    table.share.receive('ana', { t: 'resync', scene: 'another', of: 'tokens' });
    expect(table.sent.map(({ body, to }) => [body.t, to])).toEqual([['tokens', 'ana']]);
    const whole = listOf(table.sent[0]?.body as GmMessage);
    expect(whole !== null && whole !== 'gap' && whole.t === 'tokens' ? whole.tokens.map(({ x }) => x).sort() : null).toEqual([12, 20]);

    await moveTo(13);
    const after = listOf(broadcast().at(-1) as GmMessage);
    expect(after !== null && after !== 'gap' && after.t === 'tokens' ? after.tokens.map(({ x }) => x).sort() : null).toEqual([13, 20]);
    await table.advance(1_000);
    table.share.receive('ana', { t: 'resync', scene, of: 'tokens' });
    expect(table.sent.filter(({ to }) => to === 'ana')).toHaveLength(2);
  });
});

describe('a delta message', () => {
  it('is refused when malformed, and never sets the framing or turns a field into a prototype', () => {
    const base = { t: 'delta', of: 'tokens', scene: 's', seq: 2 };
    expect(asRead(base as GmMessage)).toEqual(base);
    for (const bad of [
      { ...base, of: 'walls' }, { ...base, of: 'fog', lists: { tokens: {} } }, { ...base, seq: -1 }, { ...base, seq: 1.5 }, { ...base, set: { scene: 'x' } }, { ...base, set: { tokens: [] } },
      { ...base, unset: ['seq'] }, { ...base, lists: { lights: {} } }, { ...base, lists: { tokens: { drop: ['nope'] } } }, { ...base, lists: { tokens: { patch: [{ x: 1 }] } } },
    ]) expect(parseGmMessage(bad), JSON.stringify(bad)).toBeNull();

    const reader = new DeltaReader();
    reader.read({ t: 'sight', scene: 's', seq: 1, lighting: {}, lights: [], tokens: [], held: [] });
    const polluted = parseGmMessage(JSON.parse('{"t":"delta","of":"sight","scene":"s","seq":2,"set":{"__proto__":{"blind":true}}}'));
    const read = polluted === null ? null : reader.read(polluted);
    expect(read !== null && read !== 'gap' && read.t === 'sight' ? read.blind : 'not read').toBeUndefined();
  });
});
