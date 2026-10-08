import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerAccentColorSync } from '../../src/app/plugin/accentColorSync';
import { forgetObsidianAccentColor, getObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';

/** How many elements came into or left the body while `run` ran. */
async function bodyChangesDuring(run: () => void): Promise<number> {
  let changes = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) changes += record.addedNodes.length + record.removedNodes.length;
  });
  observer.observe(document.body, { childList: true });
  run();
  await Promise.resolve();
  observer.disconnect();
  return changes;
}

/** A plugin whose workspace hands out the listeners registered on it. */
function pluginWithWorkspace(): { plugin: Plugin; registered: unknown[]; emit: (name: string) => void } {
  const listeners: { name: string; callback: () => void }[] = [];
  const registered: unknown[] = [];
  const workspace = {
    on: (name: string, callback: () => void): object => {
      const ref = { name, callback };
      listeners.push(ref);
      return ref;
    },
  };
  const plugin = { app: { workspace }, registerEvent: (ref: unknown) => { registered.push(ref); } } as unknown as Plugin;
  return { plugin, registered, emit: (name) => listeners.filter((listener) => listener.name === name).forEach((listener) => listener.callback()) };
}

describe('the accent colour the canvas draws with', () => {
  beforeEach(() => {
    forgetObsidianAccentColor();
    document.body.style.setProperty('--interactive-accent', 'rgb(10, 20, 30)');
  });
  afterEach(() => document.body.style.removeProperty('--interactive-accent'));

  it('is asked for on every pointer move of a drag without touching the document again', async () => {
    getObsidianAccentColor();

    const changes = await bodyChangesDuring(() => {
      for (let move = 0; move < 100; move++) expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
    });

    expect(changes).toBe(0);
  });

  it('follows a new accent at once', () => {
    expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
    document.body.style.setProperty('--interactive-accent', 'rgb(200, 100, 0)');
    expect(getObsidianAccentColor()).toBe('rgb(200, 100, 0)');
    document.body.style.setProperty('--interactive-accent', 'rgb(10, 20, 30)');
    expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
  });

  it('is resolved anew once Obsidian reports changed CSS, and only then', async () => {
    const { plugin, registered, emit } = pluginWithWorkspace();
    registerAccentColorSync(plugin);
    expect(registered).toHaveLength(1);
    getObsidianAccentColor();

    emit('layout-change');
    expect(await bodyChangesDuring(() => getObsidianAccentColor())).toBe(0);

    emit('css-change');
    const probe = vi.spyOn(window, 'getComputedStyle');
    expect(await bodyChangesDuring(() => getObsidianAccentColor())).toBe(2);
    expect(probe.mock.calls.some(([element]) => element instanceof HTMLElement && element.className === 'atlas-color-probe')).toBe(true);
    probe.mockRestore();

    expect(await bodyChangesDuring(() => getObsidianAccentColor())).toBe(0);
  });

  it('takes the colour a value means after the change, where the value reads the same', () => {
    document.body.style.setProperty('--interactive-accent', 'currentColor');
    document.body.style.color = 'rgb(1, 2, 3)';
    const before = getObsidianAccentColor();
    document.body.style.color = 'rgb(4, 5, 6)';
    expect(getObsidianAccentColor()).toBe(before);

    forgetObsidianAccentColor();
    const after = getObsidianAccentColor();
    document.body.style.removeProperty('color');
    expect([before, after]).toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)']);
  });
});
