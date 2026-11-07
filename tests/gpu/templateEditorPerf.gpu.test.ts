import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cdp } from 'vitest/browser';
import type { TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { FakeSession, template } from '../unit/statblocks/template-editor/editorKit';
import { gripOf, pointer, pointIn, type Point } from './dragHarness';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const LONE_TILES = 30;
const ROWS = 40;
const TILES_IN_ROW = 3;
const TILES = LONE_TILES + ROWS * TILES_IN_ROW;
/** One frame at 60 Hz. */
const FRAME_MS = 1000 / 60;

/** 150 tiles under the name: thirty of their own and forty rows of three, taking turns down the card. */
function bigTemplate(): ReturnType<typeof template> {
  const fields: TemplateField[] = [{ key: 'name', label: 'Name', type: 'text' }];
  const tile = (index: number): TemplateBlock => {
    fields.push({ key: `f${index}`, label: `Field ${index + 1}`, type: 'number' });
    return { id: `tile${index}`, type: 'stat', field: `f${index}`, look: 'run-in' };
  };
  const blocks: TemplateBlock[] = [{ id: 'title001', type: 'title', field: 'name', level: 1 }];
  for (let row = 0; row < ROWS; row++) {
    const first = LONE_TILES + row * TILES_IN_ROW;
    blocks.push({ id: `row${row}`, type: 'row', blocks: Array.from({ length: TILES_IN_ROW }, (_, place) => tile(first + place)) });
    if (row < LONE_TILES) blocks.push(tile(row));
  }
  return template(blocks, fields);
}

async function taskSeconds(): Promise<number> {
  const { metrics } = await cdp().send('Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };
  return metrics.find((metric) => metric.name === 'TaskDuration')?.value ?? 0;
}

const percentile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
};

/**
 * Frame time with 150 tiles during a drag (§13.1 S4, §14.2): the pointer
 * crosses the card once a frame, so targets, lines and slides change all the
 * time. The main thread's work per frame (CDP's task time) stays under one
 * frame, and frames come at the display's rate.
 */
describe('dragging on a large template', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('keeps every frame of a drag under 16 ms with 150 tiles', async () => {
    const session = new FakeSession(bigTemplate());
    mount(session, 1280);
    await frames(3);
    expect(document.querySelectorAll('.atlas-te-stage [data-block-id^="tile"]')).toHaveLength(TILES);
    await cdp().send('Performance.enable');

    // A tile drags by its gutter handle only (§7.1).
    const from = pointIn(await gripOf(frame('tile2')));
    const stage = document.querySelector('.atlas-te-stage')!.getBoundingClientRect();
    const scroller = document.querySelector('.atlas-sb-note-panel__scroll')!.getBoundingClientRect();
    pointer(window, 'pointerdown', from);
    pointer(window, 'pointermove', { x: from.x + 6, y: from.y + 6 });
    await frames(2);

    const moves = 120;
    const stamps: number[] = [];
    const lines = new Set<string>();
    const before = await taskSeconds();
    for (let step = 0; step < moves; step++) {
      // Across the card and down its visible part, back and forth.
      const at: Point = {
        x: stage.left + ((step * 37) % Math.max(1, stage.width - 20)) + 10,
        y: scroller.top + 60 + ((step * 23) % Math.max(1, scroller.height - 120)),
      };
      pointer(window, 'pointermove', at);
      stamps.push(await new Promise<number>((resolve) => requestAnimationFrame(resolve)));
      const shown = document.querySelector<HTMLElement>('.atlas-te-drop-line');
      if (shown) lines.add(shown.getAttribute('style') ?? '');
    }
    const busy = ((await taskSeconds()) - before) * 1000;
    pointer(window, 'pointerup', { x: from.x, y: from.y });
    await wait(300);

    const intervals = stamps.slice(1).map((stamp, index) => stamp - (stamps[index] ?? stamp));
    const perFrame = busy / moves;
    console.info(`${TILES} tiles: ${perFrame.toFixed(2)} ms of main-thread work per frame; frame interval median ${percentile(intervals, 0.5).toFixed(1)} ms, p95 ${percentile(intervals, 0.95).toFixed(1)} ms`);
    expect(lines.size, 'the drop line moved through many places').toBeGreaterThan(20);
    expect(perFrame).toBeLessThan(FRAME_MS);
    expect(percentile(intervals, 0.5)).toBeLessThan(FRAME_MS + 2);
  });
});
