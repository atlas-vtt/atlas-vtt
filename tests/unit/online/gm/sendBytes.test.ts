import { ALL_PLAYERS, PROTOCOL_VERSION } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { LightSource } from '../../../../src/app/types/lightingTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { messageParts } from '../../../../src/app/online/gm/assetServe.ts';
import { sceneState, shareHarness, token, type Sent } from './shareHarness.ts';

/**
 * What the GM uploads while players drag, by message kind, in bytes a second of frames as the
 * relay gets them. The light scene is the drag end to end test's (two tokens, unlit, one player
 * dragging); the heavy one has 40 tokens on a lit map with 150 walls and 10 lights, two players
 * dragging their seeing, light-carrying tokens at once.
 */

const STEP_MS = 33;
const DRAG_MS = 5_000;

/** The bytes of the frames a message goes out in, as `TableConnection` sends them. */
function frameBytes({ body, to }: Sent): number {
  let id = 0;
  return messageParts(body, () => String((id += 1))).reduce((sum, part) => sum + Buffer.byteLength(JSON.stringify({ v: PROTOCOL_VERSION, t: 'send', to: to ?? ALL_PLAYERS, body: part })), 0);
}

/** Bytes a second by message kind (a delta counts as the kind it changes). */
function perSecond(sent: readonly Sent[], ms: number): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const message of sent) {
    const kind = message.body.t === 'delta' ? message.body.of : message.body.t;
    totals[kind] = (totals[kind] ?? 0) + frameBytes(message);
  }
  totals.total = Object.values(totals).reduce((sum, bytes) => sum + bytes, 0);
  return Object.fromEntries(Object.entries(totals).map(([kind, bytes]) => [kind, Math.round((bytes * 1000) / ms)]));
}

const character = (id: string, x: number, y: number, changes: Partial<TokenEntity> = {}): TokenEntity =>
  ({ ...token(id, { x, y, ringColor: '#d4a017', ...changes }), kind: 'character', name: `Creature ${id}` });

/** Drags `dragged` along a slow diagonal, `STEP_MS` apart, as a player's stream moves it in the GM's store. */
async function measureDrag(initial: ReturnType<typeof sceneState>, dragged: readonly string[]): Promise<Record<string, number>> {
  const images = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ...Object.values(initial.objects.tokens).map((entry) => [entry.imagePath, new Uint8Array([1, 2, 3])] as const)]);
  const table = shareHarness(initial, images);
  table.share.start();
  await table.advance(2_000);
  table.sent.length = 0;
  let state = initial;
  const from = new Map(dragged.map((id) => [id, { x: initial.objects.tokens[id]?.x ?? 0, y: initial.objects.tokens[id]?.y ?? 0 }]));
  for (let at = STEP_MS; at <= DRAG_MS; at += STEP_MS) {
    const tokens = { ...state.objects.tokens };
    for (const [id, start] of from) {
      const entry = tokens[id];
      if (entry !== undefined) tokens[id] = { ...entry, x: start.x + at / 7.3, y: start.y + at / 11.7 };
    }
    state = { ...state, heldTokens: Object.fromEntries(from), objects: { ...state.objects, tokens } };
    await table.set(state);
    await table.advance(STEP_MS);
  }
  return perSecond(table.sent, DRAG_MS);
}

function heavyScene(): ReturnType<typeof sceneState> {
  const tokens: Record<string, TokenEntity> = {};
  for (let index = 0; index < 40; index += 1) {
    const seer = index < 6;
    tokens[`t${index}`] = character(`t${index}`, 210 + (index % 8) * 280.5, 210 + Math.floor(index / 8) * 350.25, {
      size: index % 5 === 0 ? 2 : 1, rotation: index * 13,
      ...(seer && { vision: { enabled: true, senses: [{ id: 'darkvision', range: 60 }] } }),
      ...(seer && { light: { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'torch' } }),
    });
  }
  const walls = Object.fromEntries(Array.from({ length: 150 }, (_, index): [string, WallSegment] => {
    const x = (index * 97.31) % 2800;
    const y = (index * 61.7) % 2800;
    return [`w${index}`, { id: `w${index}`, kind: 'wall', type: index % 10 === 0 ? 'door' : 'solid', p1: { x, y }, p2: { x: x + 140, y: y + 70 } }];
  }));
  const lights = Object.fromEntries(Array.from({ length: 10 }, (_, index): [string, LightSource] => [`l${index}`, {
    id: `l${index}`, kind: 'light', x: 300 + index * 250.5, y: 1400.25, emission: { bright: 20, dim: 40, color: '#ffaa55', intensity: 0.8, animation: 'torch' },
  }]));
  return sceneState({
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 },
    lighting: { enabled: true, ambient: 0.1 },
    objects: { ...sceneState().objects, tokens, walls, lights },
  });
}

describe('what the GM uploads while players drag', () => {
  it('is the places that moved, in the drag test\'s scene and in a heavy lit one', async () => {
    const light = await measureDrag(sceneState({
      grid: { enabled: true, size: 140, offsetX: 0, offsetY: 0, opacity: 1 },
      objects: { ...sceneState().objects, tokens: { ogre: character('ogre', 1540, 2310, { size: 1.5 }), bear: character('bear', 1820, 2310) } },
    }), ['ogre']);
    const heavy = await measureDrag(heavyScene(), ['t0', 't1']);
    console.info(`GM upload, bytes/s while dragging:\n  drag test scene: ${JSON.stringify(light)}\n  heavy lit scene: ${JSON.stringify(heavy)}`);
    // Whole lists went out at 18 KB/s and 357 KB/s; deltas of what moved are a few KB/s.
    expect(light.total).toBeLessThan(8_000);
    expect(heavy.total).toBeLessThan(20_000);
  });
});
