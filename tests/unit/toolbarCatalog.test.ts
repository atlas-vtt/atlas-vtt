import { describe, expect, it } from 'vitest';
import { MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { AMBIENT_AUDIO_ENABLED } from '../../src/app/featureFlags';
import {
  availableToolbarControls,
  DEFAULT_TOOLBAR_ORDER,
  isHideableToolbarControl,
  isToolbarControlId,
  TOOLBAR_CONTROLS,
  toolbarControl,
} from '../../src/app/toolbar/toolbarCatalog';

const lightingOn = (on: boolean) => (): boolean => on;

describe('toolbar catalog', () => {
  it('has unique ids', () => {
    const ids = TOOLBAR_CONTROLS.map(control => control.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lets every control be hidden except the Command palette', () => {
    expect(TOOLBAR_CONTROLS.filter(control => !control.hideable).map(control => control.id)).toEqual(['palette']);
    expect(isHideableToolbarControl('fog')).toBe(true);
    expect(isHideableToolbarControl('palette')).toBe(false);
    expect(isHideableToolbarControl('future-tool')).toBe(false);
  });

  it('names a map hotkey for every control', () => {
    const hotkeys = new Set<string>(MAP_HOTKEYS.map(hotkey => hotkey.id));
    for (const control of TOOLBAR_CONTROLS) expect(hotkeys.has(control.hotkey)).toBe(true);
  });

  it('offers the player view move, measure and dice', () => {
    expect([...availableToolbarControls(true, lightingOn(true))]).toEqual(['move', 'measure', 'dice']);
  });

  it('offers the GM everything but Lighting while it is switched off and the controls of unshipped features', () => {
    const off = availableToolbarControls(false, lightingOn(false));
    const on = availableToolbarControls(false, lightingOn(true));
    expect(off.has('wall')).toBe(false);
    expect(on.has('wall')).toBe(true);
    expect(on.has('audio')).toBe(AMBIENT_AUDIO_ENABLED);
    const expected = DEFAULT_TOOLBAR_ORDER.filter(id => id !== 'wall' && (AMBIENT_AUDIO_ENABLED || id !== 'audio'));
    expect([...off]).toEqual(expected);
  });

  it('describes each control in one sentence of at most 90 characters', () => {
    for (const { description } of TOOLBAR_CONTROLS) {
      expect(description.length).toBeLessThanOrEqual(90);
      expect(description).toMatch(/^[A-Z][^.]*\.$/);
    }
  });

  it('keeps the bar order the toolbar had before it could be arranged', () => {
    expect(DEFAULT_TOOLBAR_ORDER).toEqual(['move', 'fog', 'draw', 'text', 'measure', 'wall', 'pin', 'audio', 'dice', 'loot', 'assets', 'palette']);
  });

  it('looks controls up by id', () => {
    expect(toolbarControl('dice').hotkey).toBe('diceTray');
    expect(isToolbarControlId('loot')).toBe(true);
    expect(isToolbarControlId('toString')).toBe(false);
  });
});
