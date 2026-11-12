import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { SceneLevelRow } from '../../src/app/react/components/command-palette/SceneLevelRow';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { DASHBOARD_THEME } from './dashboardTheme';
import { centreOf, mouse } from './realMouse';

/**
 * The tooltip of an icon button names the icon the pointer rests on, in rows of icons that lie close together and under
 * each other's tooltips: the Scene levels page's rows, with the real mouse and the provider the toolbar gives the page.
 *
 * Two things once kept it from doing so. While a tooltip could be hovered, Radix held it open as long as the pointer
 * stayed between its icon and the tooltip, and let no neighbour open meanwhile: a wide tooltip reaches over the
 * neighbours, so it went on naming the icon the pointer had left. And the wrapper Radix places a tooltip with took the
 * pointer over the row above for as long as the tooltip showed or faded.
 */

const h = React.createElement;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const REPLACE = 'Replace the map image of Hall, keeping the grid, walls and lights where they are';

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: `${id}.webp` });

/** The page's rows, top floor first, moved as the page moves them. */
function Levels(): React.ReactElement {
  const [levels, setLevels] = useState(() => ['Crypt', 'Cellar', 'Hall', 'Tower'].map(level));
  const move = (index: number, direction: 1 | -1): void => setLevels((before) => {
    const next = [...before];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    return next;
  });
  return h('div', { className: 'atlas-scene-levels__list' }, [...levels].reverse().map((entry) => {
    const index = levels.indexOf(entry);
    return h(SceneLevelRow, {
      key: entry.id,
      level: entry,
      name: entry.id,
      onRename: () => undefined,
      onElevation: () => undefined,
      onPickImage: () => undefined,
      hasImage: true,
      onReplaceImage: () => undefined,
      onPickRoof: () => undefined,
      onRemoveRoof: () => undefined,
      among: {
        isViewed: false,
        canMoveUp: index < levels.length - 1,
        canMoveDown: index > 0,
        onShow: () => undefined,
        onMove: (direction) => move(index, direction),
        onDelete: () => undefined,
        below: [],
        onSees: () => undefined,
        onOpenArt: () => undefined,
      },
    });
  }));
}

/** The labels of the tooltips that show, a closing one left out. */
const shown = (): string => [...document.querySelectorAll('.tooltip-content:not([data-state="closed"]) .tooltip-label')].map((label) => label.textContent ?? '').join(' | ');

async function shows(label: string): Promise<void> {
  const end = performance.now() + 2000;
  while (shown() !== label) {
    if (performance.now() > end) throw new Error(`"${shown()}" shows, not "${label}"`);
    await sleep(16);
  }
}

function button(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('.atlas-scene-level__button')].find((entry) => {
    const id = entry.getAttribute('aria-labelledby');
    return id && document.getElementById(id)?.textContent === name;
  });
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

describe('a tooltip in rows of icon buttons', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;
  let pointer = { x: 4, y: 4 };

  /** Moves as a hand does, a step a frame, to the button's middle or `up` of the way from there to its top edge. */
  async function glide(name: string, steps: number, up = 0): Promise<void> {
    const box = button(name).getBoundingClientRect();
    const to = { x: box.left + box.width / 2, y: box.top + box.height / 2 - (box.height / 2 - 2) * up };
    const from = pointer;
    for (let step = 1; step <= steps; step++) {
      await mouse.hover(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
      await sleep(16);
    }
    pointer = to;
  }

  /** Off every icon, long enough for a tooltip to have gone. */
  async function rest(): Promise<void> {
    pointer = { x: 4, y: 4 };
    await mouse.hover(pointer.x, pointer.y);
    await sleep(300);
    expect(shown()).toBe('');
  }

  beforeEach(async () => {
    await page.viewport(900, 500);
    document.head.append(style);
    render(h('div', { className: 'atlas-vtt-plugin', style: { width: 640, margin: 60 } }, h(TooltipProvider, { delayDuration: 300, children: h(Levels) })));
    await rest();
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('names the icon the pointer came to rest on, wherever on it, and no longer the one it left', async () => {
    const pairs = [[REPLACE, 'Change the map image of Hall'], [REPLACE, 'Roof of Hall'], ['Move Hall up', 'Move Hall down'], ['Move Hall down', REPLACE], [REPLACE, 'Delete Hall']] as const;
    // The upper part of a neighbour lies between the icon left and its tooltip, where a tooltip that can be hovered stays open.
    for (const up of [0, 1]) {
      for (const [from, to] of pairs) {
        await rest();
        await glide(from, 8);
        await shows(from);
        await glide(to, 8, up);
        await sleep(700);
        expect(shown(), `from "${from}", ${up} of the way up`).toBe(to);
      }
    }
  });

  it('names an icon of the row above, which lay under the tooltip of the icon the pointer left', async () => {
    // A flick takes a few frames: it ends while the tooltip left behind still fades.
    for (const steps of [1, 2, 4, 6, 12]) {
      await rest();
      await glide(REPLACE, 8);
      await shows(REPLACE);
      const tooltip = document.querySelector('.tooltip-content')!.getBoundingClientRect();
      const above = centreOf(button('Change the map image of Tower'));
      expect(above.x > tooltip.left && above.x < tooltip.right && above.y > tooltip.top && above.y < tooltip.bottom, 'the icon above lies under the tooltip').toBe(true);
      expect(document.elementFromPoint(above.x, above.y)?.closest('button')).toBe(button('Change the map image of Tower'));

      await glide('Change the map image of Tower', steps);
      await shows('Change the map image of Tower');
    }
  });

  it('shows again for a pointer that slipped off its icon and came back while the tooltip still faded', async () => {
    // A hand jitters across an icon's edge: away for a frame or a few, each shorter than the tenth of a second of the fade.
    for (const away of [0, 30, 60]) {
      await rest();
      await glide(REPLACE, 8);
      await shows(REPLACE);
      const on = pointer;
      const box = button(REPLACE).getBoundingClientRect();
      const off = [{ x: on.x, y: box.top - 3 }, { x: on.x, y: box.bottom + 3 }].find((point) => !document.elementFromPoint(point.x, point.y)?.closest('button'));
      if (!off) throw new Error('no place beside the icon that is off every icon');

      await mouse.hover(off.x, off.y);
      await sleep(away);
      expect(document.querySelector('.tooltip-content[data-state="closed"]'), `still fading after ${away} ms away`).not.toBeNull();
      await mouse.hover(on.x, on.y);

      await sleep(500);
      expect(shown(), `back after ${away} ms`).toBe(REPLACE);
    }
    // And it still goes when the pointer does.
    await rest();
  });

  it('names what is under the pointer once a row has moved, never the button that went with its row', async () => {
    await glide('Move Hall down', 8);
    await shows('Move Hall down');
    await mouse.click(pointer.x, pointer.y);
    const names = (): string[] => [...document.querySelectorAll<HTMLInputElement>('.atlas-scene-level__name')].map((field) => field.value);
    expect(names()).toEqual(['Tower', 'Cellar', 'Hall', 'Crypt']);

    // Hall's row went down with the button that was pressed, which keeps the focus; Cellar's came under the pointer.
    for (let frame = 0; frame < 30; frame++) {
      await sleep(16);
      expect(shown()).toBe('');
    }
    await mouse.hover(pointer.x + 1, pointer.y);
    await shows('Move Cellar down');
    await glide('Change the map image of Cellar', 8);
    await shows('Change the map image of Cellar');
    await glide('Move Hall down', 8);
    await shows('Move Hall down');
  });
});
