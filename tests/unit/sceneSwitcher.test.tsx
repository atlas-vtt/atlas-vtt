// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneSwitcher } from '../../src/app/react/components/scene-switcher/SceneSwitcher';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); resetPlayerWindowStore(); document.body.innerHTML = ''; });

function OwnedSceneSwitcher(props: { onSwitchTab: (tabId: string) => void; onPresentTab: (tabId: string) => void }) {
  const [isOpen, setOpen] = React.useState(false);
  return <SceneSwitcher isOpen={isOpen} onOpenChange={setOpen} {...props} />;
}

function setup() {
  const tabMetaStore = createTabMetaStore();
  const ids = ['Tavern', 'Crystal Caves', 'Cave Entrance'].map(name => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
  tabMetaStore.getState().setActiveTab(ids[0]!);
  const onSwitchTab = vi.fn();
  const onPresentTab = vi.fn();
  const app = { vault: { adapter: { exists: async () => true, write: async () => {} } } };
  const value = { app, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <div className="workspace-leaf mod-active"><div data-view-id="map"><OwnedSceneSwitcher onSwitchTab={onSwitchTab} onPresentTab={onPresentTab} /></div></div>
  </AtlasUIContext.Provider>);
  const open = (): HTMLInputElement => {
    fireEvent.keyDown(window, { key: 'g' });
    return screen.getByRole('combobox') as HTMLInputElement;
  };
  return { ids, onSwitchTab, onPresentTab, open };
}

it('opens on the hotkey and switches by number', () => {
  const { ids, onSwitchTab, open } = setup();
  expect(screen.queryByRole('dialog')).toBeNull();
  const input = open();
  expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['1TavernCurrent', '2Crystal Caves', '3Cave Entrance']);
  fireEvent.keyDown(input, { key: '2' });
  expect(onSwitchTab).toHaveBeenCalledWith(ids[1]);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('switches to the best fuzzy match on Enter and moves the selection with arrows', () => {
  const { ids, onSwitchTab, open } = setup();
  let input = open();
  fireEvent.change(input, { target: { value: 'cave' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSwitchTab).toHaveBeenLastCalledWith(ids[2]);

  input = open();
  fireEvent.change(input, { target: { value: 'cave' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSwitchTab).toHaveBeenLastCalledWith(ids[1]);
});

it('types digits into a non-empty query, ignores the current map and closes on Escape', () => {
  const { onSwitchTab, open } = setup();
  const input = open();
  fireEvent.change(input, { target: { value: 'x' } });
  fireEvent.keyDown(input, { key: '1' });
  expect(onSwitchTab).not.toHaveBeenCalled();
  expect(screen.getByText(/No open map matches/)).toBeTruthy();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.keyDown(input, { key: '1' });
  expect(onSwitchTab).not.toHaveBeenCalled();
  open();
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('opens the map in both views on Shift+Enter and Shift+click, whether or not the player view is open', () => {
  const { ids, onSwitchTab, onPresentTab, open } = setup();
  let input = open();
  expect(screen.getByText('Open in both views')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'tavern' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(onPresentTab).toHaveBeenLastCalledWith(ids[0]);

  playerWindowStore.setState({ isOpen: true });
  input = open();
  fireEvent.change(input, { target: { value: 'cave' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(onPresentTab).toHaveBeenLastCalledWith(ids[2]);

  open();
  fireEvent.click(screen.getAllByRole('option')[1]!, { shiftKey: true });
  expect(onPresentTab).toHaveBeenLastCalledWith(ids[1]);
  expect(onSwitchTab).not.toHaveBeenCalled();
});

it('has no labels that Obsidian would show as tooltips and raises the footer only while maps are scrolled out below', () => {
  const { open } = setup();
  open();
  expect(document.querySelector('.atlas-scene-switcher [aria-label]')).toBeNull();
  const footer = document.querySelector('.atlas-scene-switcher__footer')!;
  expect(footer.classList.contains('atlas-scene-switcher__footer--raised')).toBe(false);

  const list = screen.getByRole('listbox');
  Object.defineProperties(list, { scrollHeight: { value: 300 }, clientHeight: { value: 100 }, scrollTop: { value: 0, writable: true } });
  fireEvent.scroll(list);
  expect(footer.classList.contains('atlas-scene-switcher__footer--raised')).toBe(true);
  list.scrollTop = 200;
  fireEvent.scroll(list);
  expect(footer.classList.contains('atlas-scene-switcher__footer--raised')).toBe(false);
});
