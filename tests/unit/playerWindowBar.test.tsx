// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LootDraw } from '../../src/app/loot/lootRoller';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';

const context = vi.hoisted(() => ({
  settings: null as unknown,
  service: { getWindow: vi.fn<() => Window | null>(), setCurtain: vi.fn(), toggleCameraFreeze: vi.fn(), isTrueScale: vi.fn(() => false), destroy: vi.fn() },
  closeImageDisplay: vi.fn(),
  fullScreen: { available: false, set: vi.fn(async () => undefined) },
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: { getInstance: () => context.service } }));
vi.mock('../../src/app/services/ImageDisplayService', () => ({ ImageDisplayService: { getInstance: () => ({ closeImageDisplay: context.closeImageDisplay }) } }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab: vi.fn() }));
vi.mock('../../src/app/services/playerWindowDisplay', () => ({
  fullScreenAvailable: () => context.fullScreen.available,
  setPlayerWindowFullScreen: context.fullScreen.set,
  refreshPlayerWindowDisplay: vi.fn(),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: (selector: (state: { mapPath: null }) => unknown) => selector({ mapPath: null }) }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (original) => ({ ...(await original<object>()), useAtlasUI: () => ({ app: {} }) }));
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useAtlasSettings: () => context.settings }));

const { PlayerWindowBar } = await import('../../src/app/packages/components/player-window-bar/PlayerWindowBar');
const { PlayerLootDisplay } = await import('../../src/app/services/PlayerLootDisplay');

const ROPE: LootDraw = { id: 'rope', notePath: 'Loot.md', source: [], name: 'Rope', price: '1 sp', description: '', properties: [] };
const takeBack = (): HTMLElement | null => screen.queryByRole('button', { name: 'Take back the handout' });

describe('the player window bar', () => {
  beforeEach(() => {
    context.settings = new SettingsService({} as never);
    HTMLElement.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    Element.prototype.scrollIntoView = vi.fn();
    context.service.getWindow.mockReturnValue(window);
    context.service.isTrueScale.mockReturnValue(false);
    playerWindowStore.setState({ isOpen: true });
  });
  afterEach(() => {
    act(() => PlayerLootDisplay.get().close());
    cleanup();
    resetPlayerWindowStore();
    vi.clearAllMocks();
    context.fullScreen.available = false;
  });

  it('shows nothing while the player window is closed', () => {
    playerWindowStore.setState({ isOpen: false });
    const { container } = render(<PlayerWindowBar view={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('lowers and lifts the curtain', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the map' }));
    expect(context.service.setCurtain).toHaveBeenCalledWith(true);
    act(() => playerWindowStore.setState({ curtain: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal the map' }));
    expect(context.service.setCurtain).toHaveBeenLastCalledWith(false);
  });

  it('pauses the player view and plays it again, with TrueScale off', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause the player view' }));
    expect(context.service.toggleCameraFreeze).toHaveBeenCalledOnce();
    act(() => playerWindowStore.setState({ isFrozen: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Play: the player view follows you again' }));
    expect(context.service.toggleCameraFreeze).toHaveBeenCalledTimes(2);
  });

  it('keeps the pause button but disables it while TrueScale is on', () => {
    context.service.isTrueScale.mockReturnValue(true);
    render(<PlayerWindowBar view={null} />);
    const freeze = screen.getByRole('button', { name: 'With TrueScale on, pin the players on the frame on your map' });
    expect(freeze.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(freeze);
    expect(context.service.toggleCameraFreeze).not.toHaveBeenCalled();
  });

  it('offers taking back an image only while one is shown, as its last button', () => {
    render(<PlayerWindowBar view={null} />);
    expect(takeBack()).toBeNull();
    act(() => playerWindowStore.setState({ imageShown: true }));
    const buttons = screen.getAllByRole('button');
    expect(buttons.at(-1)).toBe(takeBack());
    fireEvent.click(takeBack()!);
    expect(context.closeImageDisplay).toHaveBeenCalledWith({ quiet: true });
    act(() => playerWindowStore.setState({ imageShown: false }));
    expect(takeBack()).toBeNull();
  });

  it('offers taking back the loot window while players see it', () => {
    render(<PlayerWindowBar view={null} />);
    act(() => PlayerLootDisplay.get().toggle(ROPE));
    fireEvent.click(takeBack()!);
    expect(PlayerLootDisplay.get().showsInWindow()).toBe(false);
    expect(context.closeImageDisplay).not.toHaveBeenCalled();
    expect(takeBack()).toBeNull();
  });

  it('switches what players see from its menu and closes the window from its last row', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'What players see' }));
    const settings = context.settings as SettingsService;
    const before = settings.getLocalPlayerViewSettings().showInitiative;
    fireEvent.click(screen.getByRole('switch', { name: 'Show initiative panel' }));
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(!before);

    fireEvent.click(screen.getByRole('button', { name: 'Close player window' }));
    expect(context.service.destroy).toHaveBeenCalledTimes(1);
  });

  it('closes its menu on Escape', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'What players see' }));
    expect(screen.getByRole('dialog', { name: 'What players see' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'What players see' })).toBeNull();
  });

  it('offers full screen only where the window can be reached, and asks for a second screen', () => {
    const { rerender } = render(<PlayerWindowBar view={null} />);
    expect(screen.queryByRole('button', { name: 'Full screen on the TV' })).toBeNull();
    context.fullScreen.available = true;
    rerender(<PlayerWindowBar view={null} />);
    const button = screen.getByRole('button', { name: 'Full screen on the TV' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.classList.contains('is-active')).toBe(false);
    act(() => playerWindowStore.setState({ secondDisplay: true }));
    fireEvent.click(button);
    expect(context.fullScreen.set).toHaveBeenCalledWith(true);
    act(() => playerWindowStore.setState({ fullScreen: true }));
    const leave = screen.getByRole('button', { name: 'Leave full screen' });
    expect(leave.classList.contains('is-active')).toBe(true);
    fireEvent.click(leave);
    expect(context.fullScreen.set).toHaveBeenLastCalledWith(false);
  });
});
