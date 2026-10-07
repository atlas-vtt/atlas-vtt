import { describe, expect, it } from 'vitest';
import { fogRectangle } from '../helpers/fogOperations';
import { playerFrameLayers } from '../helpers/playerMeasureWiring';
import { CELL, playerViewScenes, type PlayerViewScene } from '../helpers/playerViewScene';
import { DEFAULT_SETTINGS } from '../../src/app/services/atlasSettings';
import type { PlayerInstanceBadges } from '../../src/app/pixi/token-renderer/PlayerInstanceBadges';

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const WARMUPS = 20;
const SAMPLES = 100;
const COLUMNS = 20;
const centre = (index: number): number => CELL / 2 + CELL * index;

interface Summary { median: number; p95: number; max: number }

function summary(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!, max: sorted[sorted.length - 1]! };
}

/** Milliseconds per call of `work`, each sample the mean of `batch` calls (the browser's clock is coarse). */
function time(work: () => void, batch: number): Summary {
  const samples: number[] = [];
  for (let i = 0; i < WARMUPS + SAMPLES; i++) {
    const start = performance.now();
    for (let j = 0; j < batch; j++) work();
    if (i >= WARMUPS) samples.push((performance.now() - start) / batch);
  }
  return summary(samples);
}

function hardware(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return `${navigator.userAgent}; ${debug && gl ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU'}; ${navigator.hardwareConcurrency} threads`;
}

/** Small art of its own for each of ten kinds of look-alikes. */
function arts(): string[] {
  return Array.from({ length: 10 }, (_, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `hsl(${index * 36}, 70%, 50%)`;
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/png');
  });
}

/**
 * 200 tokens on a 20 × 10 grid of cells, the first 100 of one art and ten each of ten others: the last
 * row hidden, 20 under fog (columns 15 to 19 of rows 0 to 3), and 20 kept rulers, from seen, hidden and
 * fogged tokens.
 */
const { scene } = playerViewScenes();
async function crowd(): Promise<PlayerViewScene> {
  const s = await scene();
  const art = arts();
  const tokens = Array.from({ length: 200 }, (_, k) => ({
    id: `t${k}`, x: centre(k % COLUMNS), y: centre(Math.floor(k / COLUMNS)), isHidden: k >= 180, imagePath: k < 100 ? '' : art[k % 10]!,
  }));
  await s.add(...tokens);
  s.setFog({
    paint: fogRectangle({ x: 15 * CELL, y: 0, width: 4 * CELL, height: 4 * CELL }),
    edge: fogRectangle({ id: 'edge', timestamp: 2, x: 19 * CELL, y: 0, width: CELL, height: 4 * CELL }),
  });
  s.events.emit('measure-persistence-changed', true);
  for (const k of [0, 2, 4, 6, 8, 40, 42, 44, 46, 48, 180, 182, 184, 186, 188, 15, 16, 17, 18, 19]) {
    const [x, y] = [centre(k % COLUMNS), centre(Math.floor(k / COLUMNS))];
    s.measureFrom(x, y, x + 2 * CELL, y + CELL);
  }
  s.store.getState().setActiveTool('select');
  return s;
}

describe('what the players\' frame of the measurements costs', () => {
  it('per capture, the work the badges and measurements add', async (ctx) => {
    const s = await crowd();
    const lighting = s.lighting.perception;
    const badges = (s.tokens as unknown as { playerBadges: PlayerInstanceBadges }).playerBadges;
    const added = time(() => {
      const seen = s.tokens.playersSeeInFrame(lighting);
      badges.pass(seen);
      badges.layers();
      s.measure.getPlayerViewLayers(seen);
    }, 100);
    const badgesOnly = time(() => {
      badges.pass(s.tokens.playersSeeInFrame(lighting));
      badges.layers();
    }, 100);
    // The players number fewer look-alikes than the GM: the badges' pass has work to do.
    expect(badges.layers().length).toBeGreaterThan(0);
    const figures = { hardware: hardware(), addedMs: added, badgesMs: badgesOnly };
    await ctx.annotate(JSON.stringify(figures), 'performance');
    console.info(`player view capture, added work: ${JSON.stringify(figures)}`);
    if (STRICT) expect(added.p95).toBeLessThanOrEqual(0.1);
  });

  it('per capture, the whole capture list', async () => {
    const s = await crowd();
    const whole = time(() => playerFrameLayers({ measure: s.measure, tokens: s.tokens, fog: s.fog, settings: DEFAULT_SETTINGS.localPlayerView, lighting: s.lighting.perception }), 10);
    console.info(`player view capture, whole list: ${JSON.stringify({ hardware: hardware(), wholeCaptureListMs: whole })}`);
    expect(whole.median).toBeGreaterThan(0);
  });

  it.each([
    ['no dragged token enters or leaves the players\' sight', [...Array.from({ length: COLUMNS }, (_, c) => 100 + c)]],
    ['one dragged token crosses the fog\'s edge at every step', [...Array.from({ length: 15 }, (_, c) => 80 + c), 99, 100, 101, 102, 103]],
  ])('per pointermove of a 20-token drag in session view, where %s', async (name, held) => {
    const s = await crowd();
    s.store.getState().setGMView(false);
    s.store.getState().setActiveTool('move');
    s.store.getState().setSelection(held.map((k) => `t${k}`));
    const grab = held[0]!;
    const [x, y] = [centre(grab % COLUMNS), centre(Math.floor(grab / COLUMNS))];
    const sprites = s.tokens.getTokenSprites();
    s.pointer('pointerdown', x, y);
    s.pointer('pointermove', x, y - CELL / 2);
    const MOVES = 10;
    const samples: number[] = [];
    const crossed = new Set<boolean>();
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample++) {
      const start = performance.now();
      for (let move = 0; move < MOVES; move++) s.pointer('pointermove', x, move % 2 === 0 ? y - CELL : y);
      if (sample >= WARMUPS) samples.push((performance.now() - start) / MOVES);
      s.pointer('pointermove', x, y - CELL);
      crossed.add(sprites['t99']?.visible ?? true);
      s.pointer('pointermove', x, y);
      crossed.add(sprites['t99']?.visible ?? true);
    }
    // The drag moved the tokens, and the token at the edge entered and left the fog where it was dragged.
    expect(sprites[`t${grab}`]?.y).toBe(y);
    expect(crossed.size).toBe(held.includes(99) ? 2 : 1);
    s.pointer('pointerup', x, y);
    const figures = { hardware: hardware(), case: name, pointermoveMs: summary(samples) };
    console.info(`session view drag cost: ${JSON.stringify(figures)}`);
    expect(samples).toHaveLength(SAMPLES);
  });
});
