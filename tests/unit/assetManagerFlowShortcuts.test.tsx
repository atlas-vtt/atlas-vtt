// @vitest-environment jsdom
import React, { useRef } from 'react';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Scope } from 'obsidian';
import { useAssetManagerShortcuts } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerShortcuts';
import { modShortcut } from '../../src/app/packages/components/asset-manager/utils/modShortcut';
import { selectedCardAction } from '../../src/app/packages/components/asset-manager/utils/cardMainAction';
import { SelectionInfo } from '../../src/app/packages/components/asset-manager/components/SelectionInfo';

afterEach(cleanup);

describe('modShortcut', () => {
  it('writes the key as each platform does and names it for assistive tech', () => {
    expect(modShortcut('n', true)).toEqual({ label: '⌘N', aria: 'Meta+N' });
    expect(modShortcut('f', false)).toEqual({ label: 'Ctrl+F', aria: 'Control+F' });
    expect(modShortcut('3', true)).toEqual({ label: '⌘3', aria: 'Meta+3' });
  });
});

describe('useAssetManagerShortcuts', () => {
  function pushedScope(app: App): Scope {
    const pushScope = vi.mocked(app.keymap.pushScope);
    return pushScope.mock.calls.at(-1)![0] as Scope;
  }

  function setup(active: boolean): { app: App; changeTab: ReturnType<typeof vi.fn>; openCreate: ReturnType<typeof vi.fn> } {
    const app = new App();
    app.keymap = { pushScope: vi.fn(), popScope: vi.fn() } as unknown as App['keymap'];
    const changeTab = vi.fn();
    const openCreate = vi.fn();
    renderHook(() => useAssetManagerShortcuts(app, active, useRef<HTMLElement>(null), changeTab, openCreate));
    return { app, changeTab, openCreate };
  }

  it('opens the Create menu on Cmd/Ctrl+N and keeps the key from Obsidian', () => {
    const { app, openCreate } = setup(true);
    const handler = pushedScope(app).keys.find((key) => key.key === 'n' && key.modifiers.includes('Mod'));
    expect(handler).toBeDefined();
    expect(handler!.func(new KeyboardEvent('keydown'))).toBe(false);
    expect(openCreate).toHaveBeenCalledTimes(1);
  });

  it('switches tabs on Cmd/Ctrl with their place', () => {
    const { app, changeTab } = setup(true);
    pushedScope(app).keys.find((key) => key.key === '2')!.func(new KeyboardEvent('keydown'));
    expect(changeTab).toHaveBeenCalledWith('maps');
  });

  it('registers nothing while a dialog of its own lies over the manager', () => {
    const { app } = setup(false);
    expect(app.keymap.pushScope).not.toHaveBeenCalled();
  });
});

describe('the selection chip', () => {
  it("names one selected card's main action and its key", () => {
    render(<SelectionInfo count={1} action={selectedCardAction('tokens')} onClear={() => {}} />);
    expect(screen.getByText('1 selected · Enter to spawn on map')).toBeTruthy();
  });

  it('tells scenes and maps apart', () => {
    expect(selectedCardAction('scenes')).toBe('1 selected · Enter to open scene');
    expect(selectedCardAction('maps')).toBe('1 selected · Enter to open its scene');
    expect(selectedCardAction('encounters')).toBe(selectedCardAction('tokens'));
  });

  it('counts a selection of several without an action', () => {
    render(<SelectionInfo count={3} onClear={() => {}} />);
    expect(screen.getByText('3 selected')).toBeTruthy();
  });
});
