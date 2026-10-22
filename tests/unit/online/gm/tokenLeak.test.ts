import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { Perception } from '../../../../src/app/vision/perception';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { TOKEN_INTERVAL_MS, TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type Sent } from './shareHarness.ts';

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

/** What a generated token stays throughout a trial: shown or not as the trial goes, always hidden, or never seen. */
type Role = 'free' | 'hidden' | 'unseen';

interface Generated {
  readonly id: string;
  readonly role: Role;
  readonly name: string;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const TRIALS = 40;
const STEPS = 12;
const PERCEPTIONS: readonly Perception[] = ['seen', 'sensed', 'unseen'];

function generate(random: () => number): Generated[] {
  const word = (): string => Math.floor(random() * 2 ** 48).toString(36).padStart(10, '0');
  const roles: readonly Role[] = ['free', 'hidden', 'unseen'];
  return Array.from({ length: 1 + Math.floor(random() * 24) }, () => {
    const key = word();
    return {
      id: `tok_${key}`,
      role: roles[Math.floor(random() * roles.length)] ?? 'free',
      name: `Name ${key}`,
      path: `art/${key}.webp`,
      bytes: new Uint8Array(16 + Math.floor(random() * 64)).map(() => Math.floor(random() * 256)),
    };
  });
}

function entityOf(entry: Generated, random: () => number, hiddenNow: boolean): TokenEntity {
  return {
    ...token(entry.id, { x: random() * 4000, y: random() * 4000, size: [1, 1.5, 2][Math.floor(random() * 3)] ?? 1, rotation: random() * 720 - 360, imagePath: entry.path, isHidden: hiddenNow, showRing: random() > 0.3 }),
    kind: 'character', name: entry.name,
  };
}

/** Every message the players got, as JSON text, without the refusals that only echo a hash a player asked for. */
const traffic = (sent: readonly Sent[]): string => sent.filter(({ body }) => body.t !== 'asset-refused').map(({ body }) => JSON.stringify(body)).join('\n');

describe('what players are sent of the tokens', () => {
  it(`never holds a hidden token's id, image, name or hash, nor an unseen token's image or name (${TRIALS} generated scenes)`, async () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(trial);
      const generated = generate(random);
      const images = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ...generated.map((entry) => [entry.path, entry.bytes] as const)]);
      const hashes = new Map(await Promise.all(generated.map(async (entry) => [entry.id, await sha256Hex(entry.bytes)] as const)));
      const visible = new Map<string, boolean>();
      const scene = (): ReturnType<typeof sceneState> => {
        const tokens: Record<string, TokenEntity> = {};
        for (const entry of generated) {
          const freeHidden = entry.role === 'free' && random() < 0.3;
          tokens[entry.id] = entityOf(entry, random, entry.role === 'hidden' || freeHidden);
        }
        return sceneState({ objects: { ...sceneState().objects, tokens } });
      };
      const table = shareHarness(scene(), images);
      table.share.start();
      for (let step = 0; step < STEPS; step += 1) {
        const next = scene();
        for (const entry of generated) visible.set(entry.id, entry.role === 'free' ? PERCEPTIONS[Math.floor(random() * 3)] === 'seen' : false);
        table.perception = (id) => (visible.get(id) === true ? 'seen' : PERCEPTIONS[1 + Math.floor(random() * 2)] ?? 'unseen');
        await table.set(next);
        await table.advance(random() < 0.5 ? TOKEN_INTERVAL_MS : TOKEN_POLL_MS);
        for (const hash of hashes.values()) table.share.receive('alice', { t: 'asset-request', hash });
        await table.settle();
        const expected = generated.filter((entry) => visible.get(entry.id) === true && next.objects.tokens[entry.id]?.isHidden !== true).map((entry) => entry.name);
        expect(tokenLists(table.sent).at(-1)?.tokens.map((entry) => entry.name).sort(), `trial ${trial} step ${step}: the players' tokens`).toEqual(expected.sort());
      }

      const sent = traffic(table.sent);
      expect(table.sent.every(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))) !== null), `trial ${trial}: malformed message`).toBe(true);
      for (const entry of generated) {
        expect(sent, `trial ${trial}: a GM token id`).not.toContain(entry.id);
        if (entry.role === 'free') continue;
        expect(sent, `trial ${trial}: ${entry.role} token's name`).not.toContain(entry.name);
        expect(sent, `trial ${trial}: ${entry.role} token's image path`).not.toContain(entry.path);
        expect(sent, `trial ${trial}: ${entry.role} token's image hash`).not.toContain(hashes.get(entry.id));
      }
    }
  });
});
