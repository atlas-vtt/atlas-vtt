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

const markdown = Array.from({ length: 20 }, (_, index) => `## Travel encounters ${index + 1}\n\n| d4 | Encounter |\n| --- | --- |\n| 1 | Rain |\n| 2-4 | Sun |`).join('\n\n');

describe('file table review layout', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;
  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(() => { document.head.append(style); });
  afterEach(() => { cleanup(); style.remove(); });

  for (const [theme, width, height] of [['light', 1280, 860], ['dark', 1280, 860], ['dark', 720, 760], ['dark', 390, 680]] as const) {
    it(`keeps review and save controls accessible in ${theme} at ${width} px`, async () => {
      await page.viewport(width, height);
      document.body.className = `theme-${theme}`;
      render(createElement(PasteTableDialog, { folder: 'atlas-vtt/collections/Cairn/tables', onSave: () => undefined, onImport: async () => undefined, onClose: () => undefined }));
      const dialog = document.querySelector<HTMLElement>('.atlas-paste-table')!;
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Import file' }));
      fireEvent.change(within(dialog).getByLabelText('Choose a table file'), { target: { files: [new File([markdown], 'Tables.md', { type: 'text/markdown' })] } });
      await expect.poll(() => dialog.querySelectorAll('.atlas-file-tables__candidate').length).toBe(20);
      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Import Travel encounters 1' }));
      const save = within(dialog).getByRole('button', { name: 'Import 1 table' });
      expect(save.hasAttribute('disabled')).toBe(false);
      const frame = dialog.getBoundingClientRect();
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.right).toBeLessThanOrEqual(width);
      expect(frame.bottom).toBeLessThanOrEqual(height);
      expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth + 1);
      const list = dialog.querySelector<HTMLElement>('.atlas-file-tables__input')!;
      const preview = dialog.querySelector<HTMLElement>('.atlas-file-tables__preview')!;
      expect(list.clientHeight).toBeGreaterThan(90);
      expect(preview.clientHeight).toBeGreaterThan(90);
      expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(frame.bottom);
      const name = within(dialog).getByRole('textbox', { name: 'Name' });
      expect(name.getBoundingClientRect().width).toBeGreaterThan(80);
      await page.screenshot({ path: `__screenshots__/random-tables-file-import-${theme}-${width}.png`, element: dialog });
    });
  }
});
