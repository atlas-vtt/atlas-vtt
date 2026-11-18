import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOL_SWITCHES, placesFreely, snapOverride, switchApplies, toolSwitch, type ToolSwitchId } from '../../src/app/types/toolSwitches';
import { placeKeysOf, placeKeysWith } from '../../src/app/pixi/fog/FogSnapping';
import { snapTurn } from '../../src/app/pixi/selection/groupTurn';
import { createInitialUIState, createUIActions, type UISlice } from '../../src/app/stores/uiSlice';

describe('tool switches', () => {
  it('a held key turns its switch around for the press', () => {
    expect(snapOverride(true, false)).toBe(true);
    expect(snapOverride(true, true)).toBe(false);
    expect(snapOverride(false, false)).toBe(false);
    expect(snapOverride(false, true)).toBe(true);
    // A synthetic event may carry no modifier state at all.
    expect(snapOverride(true, undefined)).toBe(true);
  });

  it('a state without switches reads as a desktop press without keys', () => {
    for (const id of Object.keys(DEFAULT_TOOL_SWITCHES) as ToolSwitchId[]) {
      expect(toolSwitch({}, id)).toBe(DEFAULT_TOOL_SWITCHES[id]);
    }
    // What snapped before still snaps, and what went to its cell only with Shift still does.
    expect(placesFreely({}, 'lightingSnap', false)).toBe(false);
    expect(placesFreely({}, 'lightingSnap', true)).toBe(true);
    expect(switchApplies({}, 'pinCell', false)).toBe(false);
    expect(switchApplies({}, 'pinCell', true)).toBe(true);
    expect(switchApplies({}, 'roomSnap', true)).toBe(true);
  });

  it('a switch set by hand does what the key did, and the key then undoes it', () => {
    const off = { toolSwitches: { lightingSnap: false, pinCell: true } };
    expect(placesFreely(off, 'lightingSnap', false)).toBe(true);
    expect(placesFreely(off, 'lightingSnap', true)).toBe(false);
    expect(switchApplies(off, 'pinCell', false)).toBe(true);
    expect(switchApplies(off, 'pinCell', true)).toBe(false);
    // The other switches stay as they were.
    expect(placesFreely(off, 'drawSnap', false)).toBe(false);
  });

  it('the store sets one switch and leaves the rest', () => {
    let state = { ...createInitialUIState() } as UISlice;
    const actions = createUIActions((recipe) => {
      const draft = { ...state };
      recipe(draft);
      state = draft;
    });
    expect(state.toolSwitches).toEqual(DEFAULT_TOOL_SWITCHES);
    actions.setToolSwitch('selectSnap', false);
    expect(state.toolSwitches).toEqual({ ...DEFAULT_TOOL_SWITCHES, selectSnap: false });
    expect(DEFAULT_TOOL_SWITCHES.selectSnap).toBe(true);
  });

  it('the fog reads its keys with its switches', () => {
    const none = placeKeysOf({});
    expect(placeKeysWith({}, none)).toEqual({ free: false, shift: false });
    expect(placeKeysWith({}, placeKeysOf({ ctrlKey: true, shiftKey: true }))).toEqual({ free: true, shift: true });
    const set = { toolSwitches: { fogSnap: false, fogConstrain: true } };
    expect(placeKeysWith(set, none)).toEqual({ free: true, shift: true });
    expect(placeKeysWith(set, placeKeysOf({ metaKey: true, shiftKey: true }))).toEqual({ free: false, shift: false });
  });

  it('a group turns in whole degrees while Snap is off, and Shift still steps coarsely', () => {
    expect(snapTurn(22, false)).toBe(15);
    expect(snapTurn(22.4, false, true)).toBe(22);
    expect(snapTurn(30, true, true)).toBe(45);
  });
});
