import { describe, expect, it } from 'vitest';
import { measureOriginOf, measureShownToPlayers, tokenFootprints } from '../../src/app/vision/measureOrigin';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import type { TokenEntity } from '../../src/app/types';

type Answer = 'seen' | 'sensed' | 'unseen' | 'hidden';
interface Scene {
  tokens: Record<string, TokenEntity>;
  displayed: Record<string, { x: number; y: number } | null>;
  answers: Record<string, Answer>;
}

const TRIALS = 300;
const GRID_SIZES = [24, 50, 70, 100];

/** Sprite radius written out from the sizing rule, not read from the module under test. */
function oracleRadius(gridSize: number, size: number, ringScale: number): number {
  const stroke = Math.max(1, Math.round((gridSize * 4) / 70));
  return ((gridSize - 2 * stroke) * (2 * size - 1)) / 2 * Math.max(1, ringScale);
}

/** Every token any of whose centres (displayed, stored) lies within its radius of any point. */
function oracleOrigin(scene: Scene, points: readonly { x: number; y: number }[], gridSize: number, ringScale: number): string[] {
  const ids: string[] = [];
  for (const [id, token] of Object.entries(scene.tokens)) {
    const radius = oracleRadius(gridSize, token.size || 1, ringScale);
    const centres = [scene.displayed[id], { x: token.x, y: token.y }].filter((c): c is { x: number; y: number } => !!c);
    const covered = centres.some((c) => points.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= radius + 1e-9));
    if (covered) ids.push(id);
  }
  return ids;
}

function seenIn(scene: Scene): (id: string) => boolean {
  return (id) => !!scene.tokens[id] && scene.answers[id] === 'seen';
}

function randomScene(random: () => number, everySeen: boolean): Scene {
  const tokens: Record<string, TokenEntity> = {};
  const displayed: Scene['displayed'] = {};
  const answers: Record<string, Answer> = {};
  const answerKinds: Answer[] = ['seen', 'sensed', 'unseen', 'hidden'];
  const count = 1 + Math.floor(random() * 12);
  for (let i = 0; i < count; i++) {
    const id = `t${i}`;
    const x = Math.round(random() * 600);
    const y = Math.round(random() * 600);
    const answer = everySeen ? 'seen' : answerKinds[Math.floor(random() * answerKinds.length)]!;
    tokens[id] = { id, kind: 'token', imagePath: 'goblin.png', x, y, size: [1, 1.5, 2, 2.5][Math.floor(random() * 4)]!, isHidden: answer === 'hidden' };
    const moved = random() < 0.3;
    displayed[id] = random() < 0.1 ? null : moved ? { x: x + Math.round(random() * 80 - 40), y } : { x, y };
    answers[id] = answer;
  }
  return { tokens, displayed, answers };
}

/** The next pass: tokens move, may change how the players see them, and may be deleted. */
function nextPass(random: () => number, scene: Scene, everySeen: boolean): Scene {
  const tokens = { ...scene.tokens };
  const answers = { ...scene.answers };
  const displayed = { ...scene.displayed };
  for (const id of Object.keys(tokens)) {
    if (!everySeen && random() < 0.1) {
      delete tokens[id];
      continue;
    }
    const token = tokens[id]!;
    tokens[id] = { ...token, x: token.x + Math.round(random() * 200 - 100) };
    displayed[id] = { x: tokens[id]!.x, y: token.y };
    if (!everySeen && random() < 0.4) answers[id] = (['seen', 'sensed', 'unseen', 'hidden'] as const)[Math.floor(random() * 4)]!;
  }
  return { tokens, displayed, answers };
}

function runTrials(everySeen: boolean, check: (shown: boolean, expected: boolean) => void): { hidden: number; shown: number } {
  const counts = { hidden: 0, shown: 0 };
  for (let trial = 0; trial < TRIALS; trial++) {
    const seed = 0x51ce + trial;
    const random = rng(seed);
    const gridSize = GRID_SIZES[trial % GRID_SIZES.length]!;
    const ringScale = [0.8, 1, 1.25, 1.6][Math.floor(random() * 4)]!;
    let scene = randomScene(random, everySeen);
    const ids = Object.keys(scene.tokens);
    const target = scene.tokens[ids[Math.floor(random() * ids.length)]!]!;
    const pressed = random() < 0.7
      ? { x: target.x + random() * 40 - 20, y: target.y + random() * 40 - 20 }
      : { x: random() * 600, y: random() * 600 };
    const points = [pressed, { x: Math.round(pressed.x / gridSize) * gridSize, y: Math.round(pressed.y / gridSize) * gridSize }];
    const footprints = tokenFootprints(scene.tokens, scene.displayed, gridSize, ringScale);
    const origin = measureOriginOf(points, footprints, seenIn(scene));
    const expectedIds = oracleOrigin(scene, points, gridSize, ringScale);
    try {
      expect(origin.tokenIds).toEqual(expectedIds);
      const unseenAtStart = expectedIds.some((id) => !seenIn(scene)(id));
      expect(origin.unseenAtStart).toBe(unseenAtStart);
      for (let pass = 0; pass < 6; pass++) {
        const seen = seenIn(scene);
        const shown = measureShownToPlayers(origin, seen);
        const expected = !unseenAtStart && expectedIds.every(seen);
        check(shown, expected);
        if (shown) counts.shown++;
        else counts.hidden++;
        scene = nextPass(random, scene, everySeen);
      }
    } catch (error) {
      throw new Error(`seed ${seed}: ${String(error)}`);
    }
  }
  return counts;
}

describe('measurement origins against a brute-force oracle', () => {
  it('records the tokens under the start and shows the measurement exactly while the oracle does', () => {
    const counts = runTrials(false, (shown, expected) => expect(shown).toBe(expected));
    // The trials exercise both answers.
    expect(counts.hidden).toBeGreaterThan(100);
    expect(counts.shown).toBeGreaterThan(100);
  });

  it('shows every measurement, as today, where every token is seen at every pass', () => {
    const counts = runTrials(true, (shown) => expect(shown).toBe(true));
    expect(counts.hidden).toBe(0);
  });
});
