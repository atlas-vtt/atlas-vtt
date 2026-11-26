// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { DEFAULT_DRAG_DISTANCE, DRAG_DISTANCES, readDragDistance, showsDragDistance } from '../../../src/app/measure/dragDistance';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { memoryPluginData } from '../../mocks/pluginData';

describe('when a dragged token shows its distance', () => {
  it('is always unless the GM chose otherwise: only while a fight runs, or never', () => {
    expect(showsDragDistance('always', false)).toBe(true);
    expect(showsDragDistance('always', true)).toBe(true);
    expect(showsDragDistance('combat', false)).toBe(false);
    expect(showsDragDistance('combat', true)).toBe(true);
    expect(showsDragDistance('never', false)).toBe(false);
    expect(showsDragDistance('never', true)).toBe(false);
  });

  it('reads a stored choice, and anything else as always', () => {
    expect(DEFAULT_DRAG_DISTANCE).toBe('always');
    for (const choice of DRAG_DISTANCES) expect(readDragDistance(choice)).toBe(choice);
    for (const other of [undefined, null, 'sometimes', true, 3, {}]) expect(readDragDistance(other)).toBe('always');
  });
});

describe('the drag distance setting', () => {
  it('starts as always, is saved with the GM\'s preferences and told to whoever follows the settings', async () => {
    const data = memoryPluginData();
    const settings = new SettingsService(new App(), undefined, data);
    await settings.initialize();
    expect(settings.getDragDistance()).toBe('always');

    const heard = vi.fn();
    settings.onChange(heard);
    settings.setDragDistance('combat');
    expect(settings.getDragDistance()).toBe('combat');
    expect(heard).toHaveBeenCalledTimes(1);
    settings.setDragDistance('combat');
    expect(heard).toHaveBeenCalledTimes(1);

    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ dragDistance: 'combat' });
    const reopened = new SettingsService(new App(), undefined, data);
    await reopened.initialize();
    expect(reopened.getDragDistance()).toBe('combat');
  });

  it('reads a value this Atlas does not know as always, without rewriting it', async () => {
    const data = memoryPluginData({ dragDistance: 'on-my-turn' });
    const settings = new SettingsService(new App(), undefined, data);
    await settings.initialize();
    expect(settings.getDragDistance()).toBe('always');
    await settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ dragDistance: 'on-my-turn' });
  });
});
