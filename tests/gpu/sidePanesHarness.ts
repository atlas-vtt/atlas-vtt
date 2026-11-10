import '../setup/obsidianDom';
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { TemplateEditor, type TemplateEditorHost } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import type { FakeSession } from '../unit/statblocks/template-editor/editorKit';

/**
 * The template editor with its real dock, toolbar and Options, styled by the
 * plugin's stylesheet, between two buttons outside it ("Before", "After").
 * Test files that use it mock the dice links,
 * which reach Node's `events` (no browser build).
 */
export const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-border-hover: #4a4a4a; --background-modifier-hover: rgba(255, 255, 255, 0.075);
    --background-modifier-form-field: #1a1a1a; --divider-color: #363636; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777;
    --text-accent: #a68af9; --text-error: #fb464c; --interactive-accent: #7f6df2; --mono-100: #fff; --shadow-s: 0 1px 4px rgba(0,0,0,.3);
    --shadow-l: 0 8px 24px rgba(0,0,0,.4); --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --size-2-1: 2px;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --line-height-normal: 1.5;
    --input-height: 30px; --font-monospace: monospace; --font-semibold: 600; --font-medium: 500; }
  /* The build's Tailwind utility, which main.scss does not hold: names for screen readers take no room. */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
`;
const h = React.createElement;
const noop = (): void => undefined;
const host: TemplateEditorHost = { save: async () => null, close: noop };

/** Puts the theme and the stylesheet in the page around each test. */
export function useEditorStyles(): void {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(async () => {
    await page.viewport(1280, 900);
    document.head.append(style);
  });
  afterEach(() => style.remove());
}

/** Mounts the editor `width` px wide (below 720 px the card stands above the note). Returns its root. */
export function mount(session: FakeSession, width: number): HTMLElement {
  render(h(TooltipProvider, null, h(SurfaceMenuProvider, { ownerId: 'template-editor' },
    h('div', { className: 'atlas-vtt-plugin' },
      h('button', null, 'Before'),
      h('div', { className: 'atlas-statblock-editor', 'data-surface': 'template-editor', style: { height: 760, width } },
        h(TemplateEditor, {
          session, host, collectionId: null,
        })),
      h('button', null, 'After')))));
  return document.querySelector<HTMLElement>('.atlas-te')!;
}

/** Where focus is: the editor region it lies in, the selected tile's toolbar or Options, or the stop outside the editor. */
function whereFocus(): string {
  const active = document.activeElement;
  if (!active || active === document.body) return 'body';
  if (active.closest('.atlas-sb-note-panel__handle')) return 'resize';
  if (active.closest('.atlas-te-toolbar')) return 'toolbar';
  if (active.closest('.atlas-te-options')) return 'options';
  return active.closest('[data-te-region]')?.getAttribute('data-te-region') ?? active.textContent?.trim() ?? active.tagName;
}

/** Presses Tab (or Shift+Tab) until focus reaches `stop`; the regions passed, each run of one region once. */
export async function walk(stop: string, back: boolean): Promise<string[]> {
  const visited: string[] = [];
  for (let presses = 0; presses < 80 && whereFocus() !== stop; presses++) {
    await userEvent.keyboard(back ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
    visited.push(whereFocus());
  }
  return visited.filter((place, index) => place !== visited[index - 1]);
}

export const px = (value: string): number => Number.parseFloat(value) || 0;
export const frames = (count: number, win: Window = window): Promise<void> => new Promise((resolve) => {
  let left = count;
  const tick = (): void => { if (--left <= 0) resolve(); else win.requestAnimationFrame(tick); };
  win.requestAnimationFrame(tick);
});
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export const frame = (id: string, doc: Document = document): HTMLElement => doc.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`)!;

