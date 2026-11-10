import '../setup/obsidianDom';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import type { App } from 'obsidian';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import editorCss from '../../src/app/statblocks/editor/template-editor/template-editor.scss?inline';
import { LayoutImportDialog } from '../../src/app/statblocks/editor/fs-import/LayoutImportDialog';
import type { FsLayoutImport } from '../../src/app/statblocks/fs/fsImport';

/** Obsidian's theme variables the dialog reads, in its dark theme. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626; --background-modifier-border: #363636;
    --text-normal: #dadada; --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --text-on-accent: #fff; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; --corner-shape: squircle; }
  button { corner-shape: var(--corner-shape); font: inherit; height: 30px; }
`;

const IMPORTED: FsLayoutImport = {
  id: 'daggerheart-adversary-abc123',
  name: 'DaggerHeart Adversary',
  path: 'atlas-vtt/statblock-templates/DaggerHeart Adversary.atlastemplate',
  report: {
    blocks: 17, fields: 20, dropped: [], partial: [], withoutCode: { total: 16, full: 16 },
    scripts: [{ blockId: 'a', summary: 'A button', suggestion: null }],
  },
};
const STATBLOCKS = {
  frontmatter: Array.from({ length: 568 }, (_, index) => `Adversaries/Adversary ${index + 1}.md`),
  fences: ['Adversaries/Acid Burrower.md'],
};

const dialog = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-fs-import')!;
const part = (selector: string): DOMRect => dialog().querySelector(selector)!.getBoundingClientRect();

describe('the dialog after a Fantasy Statblocks import', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css + editorCss;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

  beforeEach(async () => {
    await page.viewport(800, 600);
    document.head.append(style);
    document.body.classList.add('theme-dark');
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('keeps its buttons on one line in the footer, the move the one primary action', async () => {
    render(createElement(LayoutImportDialog, {
      app: {} as App, doc: document, layout: { id: 'dh', name: 'DaggerHeart Adversary' }, imported: IMPORTED, statblocks: STATBLOCKS,
      onOpenTemplate: () => undefined, onClose: () => undefined,
    }));
    await expect.poll(() => dialog()?.getBoundingClientRect().width).toBe(480);

    const buttons = [...dialog().querySelectorAll<HTMLElement>('.atlas-te-dialog__footer button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Open template', 'Not now', 'Move 569 statblocks to Atlas']);
    const tops = buttons.map((button) => Math.round(button.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);
    expect(buttons.filter((button) => button.classList.contains('btn--default'))).toEqual([buttons[2]]);
    // The footer's buttons end inside the dialog.
    expect(buttons.at(-1)!.getBoundingClientRect().right).toBeLessThanOrEqual(part('.atlas-te-dialog__footer').right);

    await page.screenshot({ path: '__screenshots__/fs-import-dialog.png', element: dialog() });
  });
});
