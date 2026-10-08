import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStatusBar } from '../../src/app/remote-view/RemoteStatusBar';
import { RemoteViewDice } from '../../src/app/remote-view/RemoteViewDice';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(remote = true) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-status', undefined, false, { remote });
  const dice = new RemoteViewDice(store);
  const view = render(<ViewStoreProvider store={store as never}><RemoteStatusBar /></ViewStoreProvider>);
  return { store, dice, view };
}

describe("the remote view's status bar", () => {
  it('shows nothing until its owner sets a status, and nothing outside a remote view', () => {
    expect(setup().view.container.querySelector('.atlas-remote-status-bar')).toBeNull();
    cleanup();
    expect(setup(false).view.container.querySelector('.atlas-remote-status-bar')).toBeNull();
  });

  it("shows the owner's title, connection, message and tone, and runs its action, guarded", () => {
    const { dice, view } = setup();
    const run = vi.fn(() => { throw new Error('boom'); });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() => dice.setStatus({ title: 'The table', connection: 'Disconnected', tone: 'ended', message: 'The GM left.', action: { label: 'Retry', run } }));
    const bar = view.container.querySelector('.atlas-remote-status-bar');
    expect(bar?.textContent).toContain('The table');
    expect(bar?.textContent).toContain('Disconnected');
    expect(bar?.textContent).toContain('The GM left.');
    expect(view.container.querySelector('.atlas-remote-status-bar__dot--ended')).not.toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    expect(run).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    act(() => dice.setStatus({ title: 'The table', connection: 'Connected', tone: 'connected', message: null }));
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('shows the single action first, then the actions, each telling onStatusAction its id, guarded', () => {
    const { dice, view } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const run = vi.fn();
    const heard = vi.fn();
    dice.statusActions.add(() => { throw new Error('boom'); });
    dice.statusActions.add(heard);
    act(() => dice.setStatus({
      title: '', connection: '', tone: 'pending', message: null, action: { label: 'Retry', run },
      actions: [{ id: 'shared', label: 'Library', icon: 'inbox' }, { id: 'leave', label: 'Leave' }],
    }));
    const labels = Array.from(view.container.querySelectorAll('.atlas-remote-status-bar__action')).map((button) => button.textContent);
    expect(labels).toEqual(['Retry', 'Library', 'Leave']);
    expect(view.container.querySelectorAll('.atlas-remote-status-bar__action-icon')).toHaveLength(1);
    fireEvent.click(screen.getByText('Library'));
    expect(heard).toHaveBeenCalledExactlyOnceWith('shared');
    fireEvent.click(screen.getByText('Retry'));
    expect(run).toHaveBeenCalledOnce();
    expect(heard).toHaveBeenCalledOnce();
    dice.dispose();
    fireEvent.click(screen.getByText('Leave'));
    expect(heard).toHaveBeenCalledOnce();
  });

  it('hands the store a frozen copy of the actions', () => {
    const { dice, store } = setup();
    const actions = [{ id: 'a', label: 'A' }];
    dice.setStatus({ title: 'T', connection: '', tone: 'pending', message: null, actions });
    actions[0]!.label = 'changed';
    const shown = store.getState().remoteView?.status.actions;
    expect(shown?.map(({ id, label }) => ({ id, label }))).toEqual([{ id: 'a', label: 'A' }]);
    expect(Object.isFrozen(shown)).toBe(true);
    expect(Object.isFrozen(shown?.[0])).toBe(true);
  });

  it('refuses more than 3 actions, repeated ids, empty labels and icons that are not names', () => {
    const { dice } = setup();
    const status = (actions: unknown): unknown => ({ title: 'x', connection: 'y', tone: 'pending', message: null, actions });
    const a = (id: string, extra: object = {}): object => ({ id, label: id, ...extra });
    expect(() => dice.setStatus(status([a('1'), a('2'), a('3')]) as never)).not.toThrow();
    const withAction = (actions: unknown): unknown => ({ ...(status(actions) as object), action: { label: 'Retry', run: () => undefined } });
    expect(() => dice.setStatus(withAction([a('1'), a('2')]) as never)).not.toThrow();
    expect(() => dice.setStatus(withAction([a('1'), a('2'), a('3')]) as never)).toThrow(/"actions".*3 buttons/);
    for (const bad of [[a('1'), a('2'), a('3'), a('4')], [a('1'), a('1')], [{ id: '1', label: '' }], [{ id: '', label: 'L' }], [a('1', { icon: '' })], [a('1', { icon: 3 })], 'a', [null]]) {
      expect(() => dice.setStatus(status(bad) as never)).toThrow(/"actions"/);
    }
  });

  it('refuses a malformed status', () => {
    const { dice } = setup();
    expect(() => dice.setStatus({ title: 'x', connection: 'y', tone: 'green', message: null } as never)).toThrow(/RemoteStatus/);
  });
});
