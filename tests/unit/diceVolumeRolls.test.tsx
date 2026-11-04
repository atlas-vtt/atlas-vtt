// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import type { DiceScene } from '../../src/app/dice3d/diceScene';
import type { StackedRoll } from '../../src/app/react/components/dice3d/rollStackState';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { DiceRollDisplay, type DiceRollSubscription, type RollOptions } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { setDiceVolume } from '../../src/app/dice3d/audio/diceSamples';

const { stacks } = vi.hoisted(() => ({ stacks: [] as Array<{ rolls: readonly StackedRoll[]; muted: boolean }> }));

vi.mock('../../src/app/dice3d/stagePool', () => ({ canShowDice: () => true, warmStages: vi.fn() }));
vi.mock('../../src/app/dice3d/rollPresentation', () => ({ diceSceneToShow: () => ({ plan: [], faces: [] }) as unknown as DiceScene }));
vi.mock('../../src/app/dice3d/audio/diceSamples', () => ({ setDiceVolume: vi.fn(), warmDiceSounds: vi.fn() }));
vi.mock('../../src/app/react/components/dice3d/DiceRollStack', () => ({
  DiceRollStack: (props: { rolls: readonly StackedRoll[]; muted: boolean }): null => {
    stacks.push(props);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  stacks.length = 0;
});

describe('dice volume and thrown dice', () => {
  it('keeps the silence a roll was thrown with when the volume changes, so its dice are not thrown again', () => {
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    let onRoll: ((result: DiceRollResult, options: RollOptions) => void) | undefined;
    const subscribe: DiceRollSubscription = (handler) => { onRoll = handler; return () => { onRoll = undefined; }; };
    render(React.createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      React.createElement(DiceRollDisplay, { container: document.body, subscribe })));
    const roll = (id: string): void => act(() => onRoll?.({ id, rolls: [], crit: null, total: 1 } as unknown as DiceRollResult, { muted: false }));

    roll('loud');
    act(() => settings.setDiceVolume(0));
    roll('quiet');
    act(() => settings.setDiceVolume(0.5));

    const last = stacks[stacks.length - 1]!;
    expect(last.muted).toBe(false);
    expect(last.rolls.map((entry) => [entry.result.id, entry.muted === true])).toEqual([['loud', false], ['quiet', true]]);
    expect(stacks.every((props) => !props.muted)).toBe(true);
    expect(vi.mocked(setDiceVolume)).toHaveBeenLastCalledWith(0.5);
  });
});
