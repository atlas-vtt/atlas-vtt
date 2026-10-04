import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContextMenuProvider, openContextMenuGlobal } from '../../src/app/react/root/ContextMenuContext';

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
