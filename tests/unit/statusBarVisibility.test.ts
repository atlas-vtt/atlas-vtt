// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';

vi.mock('../../src/app/player-view', () => ({ PLAYER_VIEW_TYPE: 'atlas-vtt-player' }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'atlas-vtt-dashboard' }));

import { registerStatusBarVisibility } from '../../src/app/plugin/statusBarVisibility';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../src/app/statblocks/editor/templateEditorState';
import { STATBLOCK_NOTE_CLASS } from '../../src/app/statblocks/notes/openEditors';

type Handler = (leaf?: unknown) => void;

function leafOf(type: string): { view: { getViewType: () => string; containerEl: HTMLElement } } {
  return { view: { getViewType: () => type, containerEl: document.createElement('div') } };
}

function setUp(first: unknown): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const plugin = {
    app: { workspace: { getMostRecentLeaf: () => first, on: (name: string, handler: Handler) => (handlers.set(name, handler), {}) } },
    registerEvent: () => undefined,
    register: () => undefined,
  } as unknown as Plugin;
  registerStatusBarVisibility(plugin);
  return handlers;
}

const hidden = (): boolean => document.body.classList.contains('atlas-hide-status-bar');

describe('the status bar', () => {
  afterEach(() => document.body.classList.remove('atlas-hide-status-bar'));

  it('hides while a map or a statblock template is active, and shows for other views', () => {
    const handlers = setUp(leafOf('atlas-vtt'));
    expect(hidden()).toBe(true);
    handlers.get('active-leaf-change')?.(leafOf('markdown'));
    expect(hidden()).toBe(false);
    handlers.get('active-leaf-change')?.(leafOf(TEMPLATE_EDITOR_VIEW_TYPE));
    expect(hidden()).toBe(true);
  });

  it('follows the statblock beside the active note as it comes and goes', () => {
    const note = leafOf('markdown');
    const handlers = setUp(note);
    expect(hidden()).toBe(false);
    note.view.containerEl.classList.add(STATBLOCK_NOTE_CLASS);
    handlers.get('atlas-vtt:statblock-panel-changed')?.();
    expect(hidden()).toBe(true);
    note.view.containerEl.classList.remove(STATBLOCK_NOTE_CLASS);
    handlers.get('atlas-vtt:statblock-panel-changed')?.();
    expect(hidden()).toBe(false);
  });
});
