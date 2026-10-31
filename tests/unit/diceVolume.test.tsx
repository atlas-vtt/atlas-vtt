// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { App } from 'obsidian';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterLevel, setDiceVolume } from '../../src/app/dice3d/audio/diceSamples';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import { SettingsService } from '../../src/app/services/SettingsService';
import { SoundEffectService } from '../../src/app/services/SoundEffectService';
import { playDiceReveal } from '../../src/app/audio/diceRevealSound';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { memoryPluginData } from '../mocks/pluginData';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { DiceRollDisplay, type DiceRollSubscription, type RollOptions } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';

vi.mock('../../src/app/audio/diceRevealSound', () => ({
  playDiceReveal: vi.fn(async () => undefined),
  disposeDiceRevealSound: vi.fn(),
}));

afterEach(() => {
  cleanup();
  setDiceVolume(1);
  vi.restoreAllMocks();
});

describe('dice volume', () => {
  it('is full by default, kept between 0 and 1, and full again when the file holds nonsense', async () => {
    const settings = new SettingsService(new App(), undefined, memoryPluginData({ diceVolume: 'loud' }));
    await settings.initialize();
    expect(settings.getDiceVolume()).toBe(1);
    settings.setDiceVolume(0.35);
    expect(settings.getDiceVolume()).toBe(0.35);
    settings.setDiceVolume(4);
    expect(settings.getDiceVolume()).toBe(1);
    settings.setDiceVolume(-1);
    expect(settings.getDiceVolume()).toBe(0);
  });

  it('scales the level every 3D roll fades in to', () => {
    const full = masterLevel();
    setDiceVolume(0.5);
    expect(masterLevel()).toBeCloseTo(full / 2);
    setDiceVolume(0);
    expect(masterLevel()).toBe(0);
  });

  it('plays the result card sound at the dice volume, and not at all at 0', () => {
    let volume = 0.4;
    const playDiceResult = vi.fn();
    const bus = new EventEmitter();
    const observer = new DiceToastObserver({ playDiceResult }, { getDiceDisplay: () => 'card', getDiceVolume: () => volume }, bus);
    const roll = (): void => {
      bus.emit('dice-rolled', { rolls: [], crit: null } as unknown as DiceRollResult);
    };
    try {
      roll();
      expect(playDiceResult).toHaveBeenLastCalledWith(null, 0.4);
      volume = 0;
      roll();
      expect(playDiceResult).toHaveBeenLastCalledWith(null, 0);
    } finally {
      observer.destroy();
    }
  });

  it('scales the result card sound by the dice volume and stays silent at 0', () => {
    const sounds = new SoundEffectService();
    try {
      sounds.playDiceResult('high', 0.5);
      expect(playDiceReveal).toHaveBeenLastCalledWith('high', sounds.getVolume() * 0.5);
      vi.mocked(playDiceReveal).mockClear();
      sounds.playDiceResult('high', 0);
      expect(playDiceReveal).not.toHaveBeenCalled();
    } finally {
      sounds.destroy();
    }
  });

  it('scales the card sound of a display outside a map, and keeps it silent at 0', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    settings.setDiceDisplay('card');
    let onRoll: ((result: DiceRollResult, options: RollOptions) => void) | undefined;
    const subscribe: DiceRollSubscription = (handler) => { onRoll = handler; return () => { onRoll = undefined; }; };
    render(React.createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
      React.createElement(DiceRollDisplay, { container: document.body, subscribe, cardSounds: true })));
    const roll = (): void => act(() => onRoll?.({ rolls: [], crit: null, total: 1 } as unknown as DiceRollResult, { muted: false }));

    act(() => settings.setDiceVolume(0.5));
    roll();
    expect(playDiceReveal).toHaveBeenLastCalledWith(null, 0.35);
    vi.mocked(playDiceReveal).mockClear();
    act(() => settings.setDiceVolume(0));
    roll();
    expect(playDiceReveal).not.toHaveBeenCalled();
  });
});
