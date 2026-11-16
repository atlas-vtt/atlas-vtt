import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { FloorsRequest } from '../../src/app/import/uvtt/runUvttGroupImport';
import type { UvttSource } from '../../src/app/import/uvtt/uvttSource';
import { UvttFloorsDialog } from '../../src/app/packages/components/asset-manager/components/UvttFloorsDialog';

/**
 * The dialog that offers map files as the floors of one scene, laid out by the plugin's real
 * stylesheet. The variables below stand in for Obsidian's theme.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --divider-color: #363636; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #8a8a8a; --interactive-accent: #7f6df2;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-large: 20px; --input-height: 30px; --line-height-tight: 1.3; }
  button, input { font: inherit; }
  button { height: 30px; }
`;

const REQUEST: FloorsRequest = {
  sceneName: 'Penhew-Foundation-32x40',
  floors: ['B1-Basement', '01-Ground', '02-Exhibit'].map((floor, index) => ({
    source: { fileName: `Penhew-Foundation-32x40-${floor}-nogrid-lights.uvtt` } as UvttSource,
    name: ['Basement', 'Ground', 'Exhibit'][index]!,
  })),
};

const query = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const box = (element: Element): DOMRect => element.getBoundingClientRect();

describe('the layout of the dialog for map files that can be floors', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    document.head.append(style);
    await page.viewport(900, 700);
    // Atlas' styles hold under its plugin's class, which the asset manager's window carries
    const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    render(React.createElement(UvttFloorsDialog, { request: REQUEST, onChoose: () => {} }), { container: host });
    await expect.poll(() => getComputedStyle(query('.atlas-uvtt-floors')).opacity).toBe('1');
  });

  afterEach(() => {
    cleanup();
    document.querySelectorAll('.atlas-vtt-plugin').forEach((host) => host.remove());
    style.remove();
  });

  it('keeps its padding and the space between its fields equal, and every floor row alike', async () => {
    const body = query('.atlas-uvtt-floors__body');
    const fields = [...body.querySelectorAll('.atlas-uvtt-floors__field')];
    const padding = box(fields[0]!).top - box(body).top;
    expect(padding).toBe(16);
    expect(box(fields[1]!).top - box(fields[0]!).bottom).toBeCloseTo(padding, 0);
    expect(box(body).bottom - box(fields[1]!).bottom).toBeCloseTo(padding, 0);
    expect(box(fields[0]!).left - box(body).left).toBeCloseTo(padding, 0);

    const rows = [...body.querySelectorAll('.atlas-uvtt-floors__floor')].map(box);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.height).toBeCloseTo(rows[0]!.height, 0);
      expect(row.left).toBeCloseTo(rows[0]!.left, 0);
      expect(row.right).toBeCloseTo(box(fields[1]!).right, 0);
    }
    // Each row's two buttons end at the row's inner edge, centred on it
    for (const row of body.querySelectorAll('.atlas-uvtt-floors__floor')) {
      const [up, down] = [...row.querySelectorAll('.atlas-uvtt-floors__move')].map(box);
      const inner = box(row);
      expect(inner.right - down!.right).toBeCloseTo(4, 0);
      expect(down!.left).toBeGreaterThanOrEqual(up!.right);
      expect(up!.top + up!.height / 2).toBeCloseTo(inner.top + inner.height / 2, 0);
    }
    // A long file name is cut, never wider than its row
    for (const file of body.querySelectorAll<HTMLElement>('.atlas-uvtt-floors__file')) {
      expect(file.scrollWidth).toBeGreaterThanOrEqual(file.clientWidth);
      expect(box(file).right).toBeLessThanOrEqual(box(file.closest('.atlas-uvtt-floors__floor')!).right);
    }
    await page.screenshot({ path: '__screenshots__/atlas-uvtt-floors.png', element: query('.atlas-uvtt-floors') });
  });

  it('lists the top floor first and puts the import as one scene last in its footer', () => {
    expect([...document.querySelectorAll<HTMLInputElement>('.atlas-uvtt-floors__floor input')].map((input) => input.value)).toEqual(['Exhibit', 'Ground', 'Basement']);
    const buttons = [...query('.atlas-uvtt-floors__footer').querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Import as 3 scenes', 'Import as one scene']);
    expect(box(buttons[1]!).left).toBeGreaterThan(box(buttons[0]!).right);
  });
});
