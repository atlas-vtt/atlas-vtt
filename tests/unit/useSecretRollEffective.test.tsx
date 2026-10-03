import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { useSecretRollEffective } from '../../src/app/react/hooks/useSecretRollEffective';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function setup(): { diceTool: DiceTool; settings: SettingsService; effective: () => boolean } {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  const diceTool = new DiceTool(new EventEmitter());
  const { result } = renderHook(() => useSecretRollEffective(diceTool, app));
  return { diceTool, settings, effective: () => result.current };
}

describe('useSecretRollEffective', () => {
  it('is on while the switch and Show dice rolls are both on', () => {
    const { diceTool, settings, effective } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    act(() => diceTool.setSecretRoll(true));
    expect(effective()).toBe(true);
  });

  it('is off while the switch is on and Show dice rolls is off', () => {
    const { diceTool, settings, effective } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    act(() => diceTool.setSecretRoll(true));
    expect(effective()).toBe(false);
  });

  it('turns off when Show dice rolls is turned off after the switch was on', () => {
    const { diceTool, settings, effective } = setup();
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: true }));
    act(() => diceTool.setSecretRoll(true));
    act(() => settings.setLocalPlayerViewSettings({ showDiceRolls: false }));
    expect(effective()).toBe(false);
  });

  it('is off in a view that has no dice tool', () => {
    const { app } = createInMemoryApp({ files: {} });
    const { result } = renderHook(() => useSecretRollEffective(null, app));
    expect(result.current).toBe(false);
  });
});
