import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceTool, type DiceRollResult } from '../../src/app/tools/DiceTool';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { useDiceHistory } from '../../src/app/react/components/dice-log/useDiceHistory';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { AtlasView } from '../../src/app/atlas-view';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
const observers: DiceToastObserver[] = [];
afterEach(() => { cleanup(); observers.splice(0).forEach(observer => observer.destroy()); vi.restoreAllMocks(); });

function setup() {
  const bus = new EventEmitter();
  const tool = new DiceTool(bus, () => DEFAULT_DICE_RULES, {
    random: () => 0.5, rollId: () => 'roll', roller: () => 'Mira', onFormulaError: vi.fn(),
  });
  const actions = { diceLog: [] as DiceRollResult[], addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn() };
  const getTool = (): DiceTool => tool;
  const history = renderHook(() => useDiceHistory(getTool, actions, bus));
  const sound = { playDiceResult: vi.fn() };
  observers.push(new DiceToastObserver(sound, { getDiceDisplay: () => 'card' }, bus));
  return { bus, tool, actions, history, sound };
}

describe('dice events belong to one view', () => {
  it('records and sounds a roll only in its owning view', () => {
    const a = setup();
    const b = setup();
    act(() => { a.tool.rollDice('d20'); });
    expect(a.history.result.current.history).toHaveLength(1);
    expect(a.actions.addDiceLogEntry).toHaveBeenCalledOnce();
    expect(a.sound.playDiceResult).toHaveBeenCalledOnce();
    expect(b.history.result.current.history).toEqual([]);
    expect(b.actions.addDiceLogEntry).not.toHaveBeenCalled();
    expect(b.sound.playDiceResult).not.toHaveBeenCalled();
  });

  it.each(['panel', 'tool'])('clears only its own tool, visible history and saved history from %s', (origin) => {
    const a = setup();
    const b = setup();
    act(() => { a.tool.rollDice('d6'); b.tool.rollDice('d8'); });
    act(() => origin === 'panel' ? a.history.result.current.clearHistory() : a.tool.clearHistory());
    expect(a.tool.getState().rollHistory).toEqual([]);
    expect(a.history.result.current.history).toEqual([]);
    expect(a.actions.clearDiceLog).toHaveBeenCalledOnce();
    expect(b.tool.getState().rollHistory).toHaveLength(1);
    expect(b.history.result.current.history).toHaveLength(1);
    expect(b.actions.clearDiceLog).not.toHaveBeenCalled();
  });

  it('shows a card only in the view that rolled, without broadcasting on document', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { app } = createInMemoryApp();
    new SettingsService(app).setDiceDisplay('card');
    const a = setup();
    const b = setup();
    const cards = (bus: EventEmitter) => {
      const view = { containerEl: document.body, serviceManager: { getEventBus: () => bus } } as unknown as AtlasView;
      return render(<AtlasUIContext.Provider value={{ app, view, pixiApp: null, renderer: null }}><DiceRollDisplay /></AtlasUIContext.Provider>);
    };
    const first = cards(a.bus);
    const second = cards(b.bus);
    const broadcast = vi.spyOn(document, 'dispatchEvent');
    act(() => { a.tool.rollDice('d20'); });
    expect(first.container.querySelector('.atlas-dice-toast')).not.toBeNull();
    expect(second.container.querySelector('.atlas-dice-toast')).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('removes history and sound listeners when their owners are destroyed', () => {
    const { bus, history, tool, actions, sound } = setup();
    history.unmount();
    observers.splice(0).forEach(observer => observer.destroy());
    tool.rollDice('d20');
    expect(actions.addDiceLogEntry).not.toHaveBeenCalled();
    expect(sound.playDiceResult).not.toHaveBeenCalled();
    expect(bus.listenerCount('dice-rolled')).toBe(0);
    expect(bus.listenerCount('dice-history-cleared')).toBe(0);
  });
});
