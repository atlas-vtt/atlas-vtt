/**
 * Fantasy Statblocks as these tests see it: layouts written for the tests
 * (no bundled layout's content), and the plugin switched on or off on an
 * app: its layout manager on the plugin instance, its public API on `window`.
 */

import { vi } from 'vitest';
import type { App } from 'obsidian';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';

/** Draws hit points and stress as tracks of boxes with a script, and includes the footer. */
export const MARSH_LAYOUT: FsLayout = {
  id: 'marsh-layout',
  name: 'Marsh layout',
  blocks: [
    { type: 'heading', id: 'm1', properties: ['name'], size: 1 },
    { type: 'property', id: 'm2', properties: ['speed'], display: 'Speed', conditioned: true },
    {
      type: 'javascript', id: 'm3',
      code: 'const el = createDiv();\nfor (let i = 0; i < monster.hp; i++) el.createEl("input", { type: "checkbox" });\nfor (let i = 0; i < monster.stress; i++) el.createEl("input", { type: "checkbox" });\nreturn el;',
    },
    { type: 'layout', id: 'm4', layout: 'footer-layout' },
  ],
};

export const FOOTER_LAYOUT: FsLayout = {
  id: 'footer-layout',
  name: 'Footer layout',
  blocks: [{ type: 'property', id: 'f1', properties: ['source'], display: 'Source' }],
};

/** The layout Fantasy Statblocks draws a statblock with that names none. */
export const PLAIN_LAYOUT: FsLayout = {
  id: 'plain-layout',
  name: 'Plain layout',
  blocks: [{ type: 'heading', id: 'p1', properties: ['name'], size: 1 }, { type: 'property', id: 'p2', properties: ['ac'], display: 'AC' }],
};

export const LAYOUTS: FsLayout[] = [PLAIN_LAYOUT, MARSH_LAYOUT, FOOTER_LAYOUT];

export interface FsPlugin {
  getAllLayouts: ReturnType<typeof vi.fn>;
  getDefaultLayout: ReturnType<typeof vi.fn>;
  getLayout: ReturnType<typeof vi.fn>;
}

/** Fantasy Statblocks switched on: its layout manager holds `layouts`, the first being its default. */
export function withFsPlugin(app: App, layouts: readonly FsLayout[] = LAYOUTS): FsPlugin {
  const manager: FsPlugin = {
    getAllLayouts: vi.fn(() => [...layouts]),
    getDefaultLayout: vi.fn(() => layouts[0]),
    getLayout: vi.fn((id: string) => layouts.find((layout) => layout.id === id) ?? null),
  };
  Object.assign(app, { plugins: { plugins: { 'obsidian-5e-statblocks': { manager } } } });
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures: () => [],
      hasCreature: () => false,
      getCreatureFromBestiary: () => null,
      isResolved: () => true,
    },
  });
  return manager;
}

/** Fantasy Statblocks switched off again. */
export function withoutFsPlugin(app: App): void {
  Reflect.deleteProperty(app, 'plugins');
  Reflect.deleteProperty(window, 'FantasyStatblocks');
}
