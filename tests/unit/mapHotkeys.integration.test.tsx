// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { useMapHotkeys } from '../../src/app/keyboard/useMapHotkeys';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });
it('dispatches once in the active map, observes rebinding immediately and ignores overlays and modifiers', () => {
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } } as any;
  const settings = new SettingsService(app);
  const first = vi.fn(), second = vi.fn();
  function View({ id, action }: { id: string; action: () => void }) {
    useMapHotkeys({ palette: action }, id);
    return <div data-view-id={id} />;
  }
  render(<AtlasUIContext.Provider value={{ app } as any}>
    <div className="workspace-leaf mod-active"><View id="first" action={first} /></div>
    <div className="workspace-leaf"><View id="second" action={second} /></div>
  </AtlasUIContext.Provider>);
  fireEvent.keyDown(window, { key: ' ' });
  expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  act(() => settings.setHotkey('palette', 'q'));
  fireEvent.keyDown(window, { key: ' ' });
  fireEvent.keyDown(window, { key: 'q', ctrlKey: true });
  expect(first).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: 'q' });
  expect(first).toHaveBeenCalledTimes(2);
  document.body.insertAdjacentHTML('beforeend', '<div class="atlas-dm-screen-wrapper"></div>');
  fireEvent.keyDown(window, { key: 'q' });
  expect(first).toHaveBeenCalledTimes(2);
});
