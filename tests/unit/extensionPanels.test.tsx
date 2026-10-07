import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ui = vi.hoisted(() => ({ viewId: 'view-1', isPlayerView: false }));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ view: { viewId: ui.viewId } }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useViewStoreHook: () => ({ getState: () => ({ isPlayerView: ui.isPlayerView }) }),
  useAtlasStore: (selector: (state: { isPlayerView: boolean }) => unknown) => selector({ isPlayerView: ui.isPlayerView }),
}));

import { ExtensionPanels } from '../../src/app/extensions/ExtensionPanels';
import { closePanelEverywhere, closeViewPanels, isPanelOpen, openPanel, panelState, closePanel } from '../../src/app/extensions/panelState';
import { panelSlot } from '../../src/app/extensions/slots';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import type { PanelSpec } from '../../src/api/types/ui';

const renderPanels = (): ReturnType<typeof render> => render(<TooltipProvider><ExtensionPanels /></TooltipProvider>);

/** Registers a panel; the returned `remove` also closes it, as the facade's disposer does. */
function register(panel: PanelSpec): { panel: PanelSpec; remove: () => void } {
  let removeFromSlot = (): void => undefined;
  act(() => { removeFromSlot = panelSlot.add('ext', panel); });
  return { panel, remove: () => act(() => { closePanelEverywhere(panel); removeFromSlot(); }) };
}

const open = (panel: PanelSpec, viewId = 'view-1'): void => { act(() => { openPanel(panel, viewId); }); };

function spec(overrides: Partial<PanelSpec> = {}): PanelSpec {
  return { id: 'notes', title: 'Quick notes', mount: vi.fn(() => vi.fn()), ...overrides };
}

// jsdom runs no animation frames to completion: the panel leaves at once.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  // jsdom has no PointerEvent; without one the pointer events lose their button and coordinates.
  if (typeof window.PointerEvent === 'undefined') {
    vi.stubGlobal('PointerEvent', class PointerEvent extends MouseEvent {});
  }
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  vi.unstubAllGlobals();
});

describe('Extension panels', () => {
  beforeEach(() => {
    ui.viewId = 'view-1';
    ui.isPlayerView = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    expect(panelState.getState().open).toEqual([]);
    expect(panelSlot.list()).toHaveLength(0);
  });

  it('adds nothing to the view while no panel is registered', () => {
    const { container } = renderPanels();
    expect(container.firstChild).toBeNull();
  });

  it('shows no frame while a registered panel is closed', () => {
    const { remove } = register(spec());
    const { container } = renderPanels();
    expect(container.querySelector('.atlas-extension-panel')).toBeNull();
    remove();
  });

  it('mounts once when it opens, with the container and the view context, in Atlas\'s panel frame', () => {
    const { panel, remove } = register(spec());
    const { container } = renderPanels();
    open(panel);
    expect(panel.mount).toHaveBeenCalledOnce();
    const body = container.querySelector('.atlas-extension-panel__body');
    expect(vi.mocked(panel.mount).mock.calls[0]?.[0]).toBe(body);
    expect(vi.mocked(panel.mount).mock.calls[0]?.[1]).toEqual({ viewId: 'view-1', kind: 'map', isPlayerView: false });
    expect(screen.getByRole('region', { name: 'Quick notes' })).toBeTruthy();
    expect(container.querySelector('.atlas-extension-panel__header')?.textContent).toContain('Quick notes');
    expect(screen.getByRole('button', { name: 'Close Quick notes' })).toBeTruthy();
    remove();
  });

  it('does not mount again when something else re-renders it', () => {
    const { panel, remove } = register(spec());
    const { rerender } = renderPanels();
    open(panel);
    rerender(<TooltipProvider><ExtensionPanels /></TooltipProvider>);
    act(() => { panelSlot.invalidate(); });
    expect(panel.mount).toHaveBeenCalledOnce();
    remove();
  });

  it('runs the disposer once when the panel closes', async () => {
    const dispose = vi.fn();
    const { panel, remove } = register(spec({ mount: () => dispose }));
    renderPanels();
    open(panel);
    expect(dispose).not.toHaveBeenCalled();
    act(() => { closePanel(panel, 'view-1'); });
    expect(dispose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(dispose).toHaveBeenCalledOnce();
    remove();
  });

  it('closes with the close button', async () => {
    const dispose = vi.fn();
    const { panel, remove } = register(spec({ mount: () => dispose }));
    renderPanels();
    open(panel);
    fireEvent.click(screen.getByRole('button', { name: 'Close Quick notes' }));
    expect(isPanelOpen(panel, 'view-1')).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    remove();
  });

  it('removes the frame and runs the disposer when the panel is disposed while open', async () => {
    const dispose = vi.fn();
    const { panel, remove } = register(spec({ mount: () => dispose }));
    renderPanels();
    open(panel);
    remove();
    expect(dispose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
  });

  it('runs the disposer when its view unmounts, and closes the view\'s panels', () => {
    const dispose = vi.fn();
    const { panel, remove } = register(spec({ mount: () => dispose }));
    const { unmount } = renderPanels();
    open(panel);
    unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(panelState.getState().open).toEqual([]);
    remove();
  });

  it('shows nothing and logs when mount throws, and closes the panel', () => {
    const { panel, remove } = register(spec({ mount: () => { throw new Error('boom'); } }));
    const { container } = renderPanels();
    open(panel);
    expect(container.querySelector('.atlas-extension-panel')).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('mount failed'), expect.any(Error));
    expect(isPanelOpen(panel, 'view-1')).toBe(false);
    remove();
  });

  it('survives a disposer that throws, and a mount that returns no disposer', () => {
    const throwing = register(spec({ id: 'a', mount: () => () => { throw new Error('boom'); } }));
    const bare = register(spec({ id: 'b', mount: () => undefined as never }));
    renderPanels();
    open(throwing.panel);
    open(bare.panel);
    expect(() => act(() => { closeViewPanels('view-1'); })).not.toThrow();
    throwing.remove();
    bare.remove();
  });

  it('shows a panel only in the view it is open in, and never in a player view', () => {
    const { panel, remove } = register(spec());
    const { container } = renderPanels();
    open(panel, 'another-view');
    expect(container.querySelector('.atlas-extension-panel')).toBeNull();
    act(() => { closeViewPanels('another-view'); });
    ui.isPlayerView = true;
    cleanup();
    const player = renderPanels();
    open(panel);
    expect(player.container.querySelector('.atlas-extension-panel')).toBeNull();
    expect(panel.mount).not.toHaveBeenCalled();
    act(() => { closeViewPanels('view-1'); });
    remove();
  });

  it('keeps two panels with the same id from different extensions apart', () => {
    const first = register(spec({ id: 'same', title: 'First' }));
    const second = register(spec({ id: 'same', title: 'Second' }));
    renderPanels();
    open(first.panel);
    open(second.panel);
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['First', 'Second']);
    first.remove();
    second.remove();
  });

  it('stays in the stack until its header is dragged, then moves with the pointer', () => {
    const { panel, remove } = register(spec());
    const { container } = renderPanels();
    open(panel);
    const frame = screen.getByRole('region', { name: 'Quick notes' });
    const header = container.querySelector('.atlas-extension-panel__header') as HTMLElement;
    expect(frame.classList.contains('is-moved')).toBe(false);
    expect(frame.style.left).toBe('');

    fireEvent.pointerDown(header, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 130 });
    expect(frame.classList.contains('is-dragging')).toBe(true);
    fireEvent.pointerUp(window);

    expect(frame.classList.contains('is-moved')).toBe(true);
    expect(frame.classList.contains('is-dragging')).toBe(false);
    // jsdom lays nothing out, so the panel starts at its margin (12) and moves by the pointer's travel.
    expect(frame.style.left).toBe('52px');
    expect(frame.style.top).toBe('42px');
    remove();
  });

  it('does not drag when the close button is pressed', () => {
    const { panel, remove } = register(spec());
    renderPanels();
    open(panel);
    const frame = screen.getByRole('region', { name: 'Quick notes' });
    const close = screen.getByRole('button', { name: 'Close Quick notes' });
    fireEvent.pointerDown(close, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 160 });
    fireEvent.pointerUp(window);
    expect(frame.classList.contains('is-moved')).toBe(false);
    expect(frame.classList.contains('is-dragging')).toBe(false);
    expect(frame.style.left).toBe('');
    fireEvent.click(close);
    expect(isPanelOpen(panel, 'view-1')).toBe(false);
    remove();
  });
});
