import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeContextMenuGlobal, ContextMenuProvider, openContextMenuGlobal } from '../../src/app/react/root/ContextMenuContext';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('still opens the global context menu after a later-mounted provider unmounts', async () => {
  render(<ContextMenuProvider><div>Asset manager</div></ContextMenuProvider>);
  const otherMap = render(<ContextMenuProvider><div>Other map</div></ContextMenuProvider>);
  otherMap.unmount();

  openContextMenuGlobal([{ type: 'item', label: 'Rename', onClick: vi.fn() }], { x: 10, y: 10 });
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy());
});

it('opens its menus in the document it renders in, as a map in a popout does', async () => {
  const popout = document.implementation.createHTMLDocument('popout');
  const host = popout.body.appendChild(popout.createElement('div'));
  render(<ContextMenuProvider><div>Popout map</div></ContextMenuProvider>, { container: host });

  openContextMenuGlobal([{ type: 'item', label: 'Hide', onClick: vi.fn() }], { x: 10, y: 10 });
  await waitFor(() => expect(popout.body.querySelector('.atlas-ctx-menu')).not.toBeNull());
  expect(document.body.querySelector('.atlas-ctx-menu')).toBeNull();
});

it('returns keyboard focus without scrolling the view', async () => {
  const host = render(<ContextMenuProvider><button>Return here</button></ContextMenuProvider>);
  const trigger = host.getByRole('button');
  act(() => openContextMenuGlobal([{ type: 'item', label: 'Hide', onClick: vi.fn() }], { x: 10, y: 10 }, { returnFocus: trigger }));
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeTruthy());
  const focus = vi.spyOn(trigger, 'focus');
  act(() => closeContextMenuGlobal());
  await waitFor(() => expect(focus).toHaveBeenCalledWith({ preventScroll: true }));
});

it('closes on a window resize and reports the close only once', async () => {
  render(<ContextMenuProvider><div>Map</div></ContextMenuProvider>);
  const onClose = vi.fn();
  act(() => openContextMenuGlobal([{ type: 'item', label: 'Hide', onClick: vi.fn() }], { x: 10, y: 10 }, { onClose }));
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeTruthy());
  act(() => {
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
  });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(onClose).toHaveBeenCalledOnce();
});

it('listens for resize in the menu’s own window', async () => {
  const frame = document.body.appendChild(document.createElement('iframe'));
  const popout = frame.contentDocument!;
  const host = render(<ContextMenuProvider><div>Popout map</div></ContextMenuProvider>, { container: popout.body.appendChild(popout.createElement('div')) });
  try {
    act(() => openContextMenuGlobal([{ type: 'item', label: 'Hide', onClick: vi.fn() }], { x: 10, y: 10 }));
    await waitFor(() => expect(popout.body.querySelector('.atlas-ctx-menu')).not.toBeNull());
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(popout.body.querySelector('.atlas-ctx-menu')).not.toBeNull();
    act(() => { frame.contentWindow!.dispatchEvent(new Event('resize')); });
    await waitFor(() => expect(popout.body.querySelector('.atlas-ctx-menu')).toBeNull());
  } finally {
    host.unmount();
    frame.remove();
  }
});
