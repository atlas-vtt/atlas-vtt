import '../setup/obsidianDom';
import { createElement } from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { PasteTableDialog } from '../../src/app/react/components/randomTables/PasteTableDialog';
import { TABLES_THEME } from './randomTablesHarness';

vi.mock('events', async () => import('eventemitter3'));

/** Six lines as a PDF gives them: a wrapped line, a word broken at the line end, a number the die never rolls. */
const PDF = `d6 Encounter
1 Two giant rats fighting over a dead centipede
2 A brewery cat, Mustard, who followed the party down
3 Ale seeps through the ceiling; the smell draws a swarm
of rats
4 A ghostly whisper repeats the first line of the riddle
5 A loose flagstone hides a 10 ft. fall into a cis-
tern with \`2d6\` gp
7 Nothing but warm air and a faint crackling`;

const dialog = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-paste-table')!;
const rect = (element: Element): DOMRect => element.getBoundingClientRect();

describe('New table, pasted into a note', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(() => { document.head.append(style); });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  for (const [theme, width, height] of [['light', 1280, 860], ['dark', 1280, 860], ['dark', 720, 760]] as const) {
    it(`previews the table with its problems and keeps its footer on one line, in ${theme} at ${width} px`, async () => {
      await page.viewport(width, height);
      document.body.className = `theme-${theme}`;
      render(createElement(PasteTableDialog, { folder: 'atlas-vtt/collections/Cairn/tables', onSave: () => undefined, onClose: () => undefined }));
      await expect.poll(() => dialog() !== null).toBe(true);
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Name' }), { target: { value: 'Cellar encounters' } });
      fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Table to paste' }), { target: { value: PDF } });
      await expect.poll(() => dialog().querySelectorAll('.atlas-table-preview__table tbody tr').length).toBe(6);

      expect([...dialog().querySelectorAll('.atlas-tables-chip--problem')].map((chip) => chip.textContent)).toEqual(['1 row the die never rolls', '1 gap']);
      const frame = rect(dialog());
      expect(frame.right).toBeLessThanOrEqual(width);
      expect(frame.bottom).toBeLessThanOrEqual(height);
      const buttons = [...dialog().querySelectorAll('.atlas-paste-table__footer button')];
      expect(new Set(buttons.map((button) => Math.round(rect(button).top))).size).toBe(1);
      const input = rect(dialog().querySelector('.atlas-paste-table__input')!);
      const preview = rect(dialog().querySelector('.atlas-paste-table__preview')!);
      if (width > 760) expect(Math.abs(input.width - preview.width)).toBeLessThan(2);
      else expect(preview.top).toBeGreaterThanOrEqual(input.bottom - 1);
      await page.screenshot({ path: `__screenshots__/random-tables-paste-${theme}-${width}.png`, element: dialog() });
    });
  }
});
