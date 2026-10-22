import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { INPUT_INTERVAL_MS } from '../../../../src/app/online/gm/InputShare.ts';
import { GENERIC_SOURCE, gmPerception } from './gmLighting.ts';
import { roundPlace } from '../../../../src/app/online/gm/scenePicture.ts';
import { sceneState, sequenced, shareHarness, token, tokenLists, type Sent } from './shareHarness.ts';

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

/**
 * What a generated token stays: free (moves about, seen or not), hidden (sees and shines), under
 * fog all along, or under fog all along while it sees and shines.
 */
type Role = 'free' | 'hidden' | 'fogged' | 'fogged-seer';

interface Generated {
  readonly id: string;
  readonly role: Role;
  readonly name: string;
  readonly path: string;
  readonly colour: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const TRIALS = 30;
const STEPS = 8;
const MAP = { width: 3000, height: 3000 };
/** Fogged tokens stand in this square, which fog covers all along. */
const FOGGED = { x: 2200, y: 2200, size: 600 };

function generate(random: () => number): Generated[] {
  const word = (): string => Math.floor(random() * 2 ** 48).toString(36).padStart(10, '0');
  const roles: readonly Role[] = ['free', 'free', 'hidden', 'fogged', 'fogged-seer'];
  return Array.from({ length: 4 + Math.floor(random() * 16) }, () => {
    const key = word();
    return {
      id: `tok_${key}`,
      role: roles[Math.floor(random() * roles.length)] ?? 'free',
      name: `Name ${key}`,
      path: `art/${key}.webp`,
      colour: `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')}`,
      bytes: new Uint8Array(16 + Math.floor(random() * 64)).map(() => Math.floor(random() * 256)),
    };
  });
}

/** A place with many digits, so that no two tokens share one. */
const place = (random: () => number, from: number, size: number): number => from + 10 + random() * (size - 20) + 1e-7;

function entityOf(entry: Generated, random: () => number): TokenEntity {
  const fogged = entry.role === 'fogged' || entry.role === 'fogged-seer';
  const at = fogged ? { x: place(random, FOGGED.x, FOGGED.size), y: place(random, FOGGED.y, FOGGED.size) } : { x: place(random, 0, 2000), y: place(random, 0, 2000) };
  const seer = entry.role === 'hidden' || entry.role === 'fogged-seer' || (entry.role === 'free' && random() < 0.3);
  return {
    ...token(entry.id, {
      ...at, imagePath: entry.path, isHidden: entry.role === 'hidden',
      ...(seer && { vision: { enabled: true, senses: [{ id: 'darkvision', range: 30 }] } }),
      ...(seer && { light: { bright: 10, dim: 20, color: entry.colour, intensity: 1, animation: 'none' } }),
    }),
    kind: 'character', name: entry.name,
  };
}

function walls(random: () => number): Record<string, WallSegment> {
  return Object.fromEntries(Array.from({ length: 12 }, (_, index): [string, WallSegment] => {
    const x = random() * 2000;
    const y = random() * 2000;
    return [`w${index}`, { id: `w${index}`, kind: 'wall', type: index % 4 === 0 ? 'secret-door' : 'solid', p1: { x, y }, p2: { x: x + random() * 400, y: y + random() * 400 }, ...(index % 4 === 0 && { locked: true }) }];
  }));
}

const FOG: Record<string, FogOperation> = {
  cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: FOGGED.x, y: FOGGED.y, width: FOGGED.size, height: FOGGED.size },
};

const traffic = (sent: readonly Sent[]): string => sent.filter(({ body }) => body.t !== 'asset-refused').map(({ body }) => JSON.stringify(body)).join('\n');

describe('what players are sent of fog and lighting', () => {
  it(`never holds a hidden token or its light, nor anything but sight and light of a token under fog (${TRIALS} generated scenes)`, async () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(trial);
      const generated = generate(random);
      const images = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ...generated.map((entry) => [entry.path, entry.bytes] as const)]);
      const hashes = new Map(await Promise.all(generated.map(async (entry) => [entry.id, await sha256Hex(entry.bytes)] as const)));
      const lit = trial % 2 === 0;
      const sceneWalls = walls(random);
      const scene = (): ReturnType<typeof sceneState> => sceneState({
        lighting: { enabled: lit, ambient: random() * 0.4 },
        objects: { ...sceneState().objects, fog: FOG, walls: sceneWalls, tokens: Object.fromEntries(generated.map((entry) => [entry.id, entityOf(entry, random)])) },
      });
      const placesOf = new Map<string, number[]>();
      const table = shareHarness(scene(), images);
      table.share.start();
      for (let step = 0; step < STEPS; step += 1) {
        const next = scene();
        for (const entry of generated) placesOf.set(entry.id, [...(placesOf.get(entry.id) ?? []), next.objects.tokens[entry.id]?.x ?? 0]);
        const sees = gmPerception(next, GENERIC_SOURCE, MAP);
        table.perception = sees;
        await table.set(next);
        await table.advance(INPUT_INTERVAL_MS);
        for (const hash of hashes.values()) table.share.receive('alice', { t: 'asset-request', hash });
        await table.settle();
        const listed = tokenLists(table.sent).at(-1)?.tokens.map((entry) => entry.name) ?? [];
        const expected = generated.filter((entry) => entry.role === 'free' && sees(entry.id) === 'seen').map((entry) => entry.name);
        expect(listed.sort(), `trial ${trial} step ${step}: the players' tokens`).toEqual(expected.sort());
      }

      const sent = traffic(table.sent);
      expect(table.sent.every(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))) !== null), `trial ${trial}: malformed message`).toBe(true);
      expect(sent.includes('"t":"sight"'), `trial ${trial}: sight goes out only for a lit scene`).toBe(lit);
      expect(sent, `trial ${trial}: a secret door's lock`).not.toContain('locked');
      const sentPlaces = new Set([
        ...sequenced(table.sent, 'sight').flatMap((message) => [...message.tokens.map(({ x }) => x), ...message.held.map(({ x }) => x)]),
        ...tokenLists(table.sent).flatMap((message) => message.tokens.map(({ x }) => x)),
      ]);
      for (const entry of generated) {
        expect(sent, `trial ${trial}: a GM token id`).not.toContain(entry.id);
        if (entry.role === 'free') continue;
        expect(sent, `trial ${trial}: ${entry.role} token's name`).not.toContain(entry.name);
        expect(sent, `trial ${trial}: ${entry.role} token's image path`).not.toContain(entry.path);
        expect(sent, `trial ${trial}: ${entry.role} token's image hash`).not.toContain(hashes.get(entry.id));
        // Only a token under fog that sees or shines goes out, with its place and light alone, and only for a lit scene.
        // Places go out rounded (`roundPlace`), so they are looked for in what players hold, not in the text.
        const placeSent = (placesOf.get(entry.id) ?? []).some((x) => sentPlaces.has(roundPlace(x)));
        expect(placeSent, `trial ${trial}: ${entry.role} token's place`).toBe(lit && entry.role === 'fogged-seer');
        expect(sent.includes(entry.colour), `trial ${trial}: ${entry.role} token's light`).toBe(lit && entry.role === 'fogged-seer');
      }
    }
  });
});
