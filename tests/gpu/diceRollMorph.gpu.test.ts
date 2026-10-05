import '../setup/obsidianDom';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throwStyle } from '../../src/app/dice3d/diceDisplay';
import { sceneFromRolls } from '../../src/app/dice3d/diceScene';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { DiceRollStack } from '../../src/app/react/components/dice3d/DiceRollStack';
import type { StackedRoll } from '../../src/app/react/components/dice3d/rollStackState';

// The header reaches into the app's services for the roller's artwork; the morph does not need it.
vi.mock('../../src/app/react/components/dice3d/DiceRollHeader', () => ({ DiceRollHeader: (): null => null }));

/** The part of dice-roll.scss the morph depends on: a tall, round panel that becomes a row with a small dice field. */
const LAYOUT = `
  .atlas-dice-rolls { width: 336px; display: flex; flex-direction: column; gap: 8px; }
  .atlas-dice-roll { width: 100%; display: flex; flex-direction: column; }
  .atlas-dice-roll__sheet { position: relative; display: flex; flex-direction: column; overflow: hidden; border: 2px solid; border-radius: 24px; }
  .atlas-dice-roll__content { display: flex; flex-direction: column; }
  .atlas-dice-roll__floor { width: 100%; aspect-ratio: 16 / 10; }
  .atlas-dice-roll__row { min-height: 54px; }
  .atlas-dice-roll__stage { position: absolute; inset: 0; overflow: hidden; }
  .atlas-dice-roll--compact .atlas-dice-roll__stage { inset: 4px auto auto 4px; height: 46px; aspect-ratio: 1; }
  .atlas-dice-stage__canvas { position: absolute; bottom: 0; left: 0; display: block; max-width: none; }
`;
/** Longer than the morph's spring. */
const MORPH_FRAMES = 40;

function roll(id: string): StackedRoll {
  const result: DiceRollResult = {
    id, timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 12, max: 20 }], modifiers: 0, total: 12,
  };
  const scene = sceneFromRolls(result.rolls);
  if (!scene) throw new Error('a d20 has a body');
  return { result, scene, style: throwStyle('full') };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * How far an element as drawn is out of shape against the element as laid out,
 * 1 being none: any difference is a transform stretching it. Null while it is missing.
 */
function stretchOf(el: HTMLElement | null): number | null {
  if (!el) return null;
  const drawn = el.getBoundingClientRect();
  const ratio = (drawn.height / el.offsetHeight) / (drawn.width / el.offsetWidth);
  return Math.max(ratio, 1 / ratio);
}

/** The largest value `measure` gives over the frames of a morph. */
async function worstOverMorph(measure: () => number | null): Promise<number> {
  let worst = 0;
  for (let i = 0; i < MORPH_FRAMES; i++) {
    await nextFrame();
    worst = Math.max(worst, measure() ?? 0);
  }
  return worst;
}

describe('the roll stack rearranging', () => {
  const style = document.createElement('style');
  style.textContent = LAYOUT;
  let host: HTMLElement;
  let root: Root;

  const show = (rolls: StackedRoll[]): void => flushSync(() => root.render(
    React.createElement(DiceRollStack, { rolls, muted: true, onClose: () => undefined, onDone: () => undefined }),
  ));

  beforeEach(() => {
    document.head.append(style);
    host = document.createElement('div');
    host.className = 'atlas-dice-rolls';
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it.each([
    ['dice', '.atlas-dice-roll__stage'],
    ['panel, with its corners and border,', '.atlas-dice-roll__sheet'],
  ])('never stretches the %s of a roll shrinking to a row', async (_what, part) => {
    const first = roll('first');
    show([first]);
    await worstOverMorph(() => null);
    show([first, roll('second')]);

    const stretch = await worstOverMorph(() => stretchOf(host.querySelector(`.atlas-dice-roll--compact ${part}`)));
    // A measured stretch is at least 1: 0 means the row was never found.
    expect(stretch).toBeGreaterThanOrEqual(1);
    expect(stretch).toBeLessThan(1.05);
  });

  it('opens at its full height', async () => {
    show([roll('first')]);
    const heights: number[] = [];
    await worstOverMorph(() => {
      heights.push(host.querySelector<HTMLElement>('.atlas-dice-roll__sheet')?.offsetHeight ?? 0);
      return null;
    });
    expect(new Set(heights).size).toBe(1);
  });

  it('shrinks to a row over time, not at once', async () => {
    const first = roll('first');
    show([first]);
    await worstOverMorph(() => null);
    const large = host.querySelector<HTMLElement>('.atlas-dice-roll__sheet')?.offsetHeight ?? 0;
    show([first, roll('second')]);

    const heights: number[] = [];
    await worstOverMorph(() => {
      heights.push(host.querySelector<HTMLElement>('.atlas-dice-roll--compact .atlas-dice-roll__sheet')?.offsetHeight ?? 0);
      return null;
    });
    const row = heights[heights.length - 1] ?? 0;
    expect(row).toBeLessThan(large / 2);
    expect(heights.some((height) => height > row + 20 && height < large - 20)).toBe(true);
  });

  it('keeps the canvas of a roll shrinking to a row, and shows its bottom left corner', async () => {
    const first = roll('first');
    show([first]);
    await worstOverMorph(() => null);
    const canvas = host.querySelector('canvas')!;
    const { width, height } = canvas;
    show([first, roll('second')]);
    await worstOverMorph(() => null);

    const stage = host.querySelector<HTMLElement>('.atlas-dice-roll--compact .atlas-dice-roll__stage')!;
    expect(stage.contains(canvas)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([width, height]);
    const shown = stage.getBoundingClientRect();
    const drawn = canvas.getBoundingClientRect();
    expect(drawn.left).toBeCloseTo(shown.left, 0);
    expect(drawn.bottom).toBeCloseTo(shown.bottom, 0);
    expect(drawn.height).toBeGreaterThan(shown.height * 2);
  });

  it('keeps the dice on a panel that moves up', async () => {
    const second = roll('second');
    show([roll('first'), second]);
    await worstOverMorph(() => null);
    show([second]);

    const drift = await worstOverMorph(() => {
      const sheet = host.querySelector<HTMLElement>('.atlas-dice-roll__sheet');
      const stage = host.querySelector<HTMLElement>('.atlas-dice-roll__stage');
      if (!sheet || !stage) return null;
      // The stage fills the sheet inside its border.
      return Math.abs(stage.getBoundingClientRect().top - sheet.getBoundingClientRect().top - sheet.clientTop);
    });
    expect(drift).toBeLessThan(2);
  });
});
