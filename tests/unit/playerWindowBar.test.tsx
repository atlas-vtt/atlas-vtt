// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import type { LootDraw } from '../../src/app/loot/lootRoller';
import { imageDisplayChanged } from '../../src/app/services/imageDisplayChanges';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { SettingsService } from '../../src/app/services/SettingsService';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import { tableControlsStore } from '../../src/app/stores/tableControlsStore';
import { switchOn } from '../mocks/experimentalFeatures';

const context = vi.hoisted(() => ({
  settings: null as unknown,
  service: { getWindow: vi.fn<() => Window | null>(), setCurtain: vi.fn(), freezeCamera: vi.fn(), unfreezeCamera: vi.fn(), isFrozen: vi.fn(() => false), isWindowOpen: vi.fn(() => true), isTrueScale: vi.fn(() => false), destroy: vi.fn() },
  fullScreen: { available: false, set: vi.fn(async () => undefined) },
  openPlayerWindow: vi.fn(async () => undefined),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: { getInstance: () => context.service } }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab: vi.fn(), openPlayerWindow: context.openPlayerWindow }));
vi.mock('../../src/app/platform/desktopOnly', () => ({ isDesktopApp: () => true, desktopOnly: <T,>(...items: T[]): T[] => items }));
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
const { ImageDisplayService } = await import('../../src/app/services/ImageDisplayService');
const { ImageTakeover } = await import('../../src/app/online/gm/image/imageTakeover');

const ART = 'Art/handout.png';

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
    tableControlsStore.setState({ curtain: false, paused: false, playMode: 'table', online: false });
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
    expect(tableControlsStore.getState().curtain).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal the map' }));
    expect(context.service.setCurtain).toHaveBeenLastCalledWith(false);
  });

  it('pauses the player view and plays it again, with TrueScale off', () => {
    render(<PlayerWindowBar view={null} />);
    context.service.freezeCamera.mockImplementation(() => context.service.isFrozen.mockReturnValue(true))
    fireEvent.click(screen.getByRole('button', { name: 'Pause the player view' }));
    expect(context.service.freezeCamera).toHaveBeenCalledOnce();
    act(() => playerWindowStore.setState({ isFrozen: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Play: the player view follows you again' }));
    expect(context.service.unfreezeCamera).toHaveBeenCalledOnce();
  });

  it('keeps the pause button but disables it while TrueScale is on', () => {
    context.service.isTrueScale.mockReturnValue(true);
    render(<PlayerWindowBar view={null} />);
    const freeze = screen.getByRole('button', { name: 'With TrueScale on, pin the players on the frame on your map' });
    expect(freeze.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(freeze);
    expect(context.service.freezeCamera).not.toHaveBeenCalled();
  });

  it('shows the table\'s controls while an online table runs, without the player window', () => {
    playerWindowStore.setState({ isOpen: false });
    context.service.isWindowOpen.mockReturnValue(false);
    act(() => tableControlsStore.setState({ online: true }));
    render(<PlayerWindowBar view={null} />);
    expect(screen.queryByRole('button', { name: 'TrueScale' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the map' }));
    expect(tableControlsStore.getState().curtain).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Pause the player view/ }));
    expect(tableControlsStore.getState().paused).toBe(true);
    expect(context.service.freezeCamera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Play: the player view/ }));
    expect(tableControlsStore.getState().paused).toBe(false);
  });

  it('opens the player window for a shared screen beside online play, and closes it from the same button once it is open', () => {
    playerWindowStore.setState({ isOpen: false });
    act(() => tableControlsStore.setState({ online: true }));
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Open player window/ }));
    expect(context.openPlayerWindow).toHaveBeenCalledOnce();
    act(() => playerWindowStore.setState({ isOpen: true }));
    expect(screen.queryByRole('button', { name: /Open player window/ })).toBeNull();
    expect(screen.getAllByRole('button')[0]).toBe(screen.getByRole('button', { name: 'Close player window' }));
    expect(screen.getByRole('button', { name: 'TrueScale' })).toBeTruthy();
  });

  it('says how online players play in what players see, with online play\'s own switches, and drops the window\'s rows while it is closed', () => {
    playerWindowStore.setState({ isOpen: false });
    switchOn(context.settings as SettingsService, 'onlinePlay');
    act(() => tableControlsStore.setState({ online: true }));
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(screen.getByRole('radiogroup', { name: 'Play mode' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show initiative panel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close player window' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Remote control' }));
    expect(tableControlsStore.getState().playMode).toBe('remote');
    act(() => tableControlsStore.setState({ online: false }));
    expect(screen.queryByRole('button', { name: 'Table settings' })).toBeNull();
  });

  it('lets the GM set the play mode before a table runs, while online play is switched on', () => {
    switchOn(context.settings as SettingsService, 'onlinePlay');
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(screen.getByRole('radiogroup', { name: 'Play mode' })).toBeTruthy();
  });

  it('keeps the play mode out of what players see while online play is switched off', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(screen.queryByRole('radiogroup', { name: 'Play mode' })).toBeNull();
  });

  /** Atlas's image display, over a vault that holds the handout. */
  function imageDisplay(): { service: InstanceType<typeof ImageDisplayService>; file: TFile } {
    const { app } = createInMemoryApp({ files: { [ART]: 'the handout' } });
    return { service: new ImageDisplayService(app), file: app.vault.getFileByPath(ART)! };
  }

  /**
   * The image an online table shows its players, as online play's table holds it, and what online play
   * does on every change of its table: it looks at the image display again (`ImageTakeover.sync`).
   */
  function onlineTable(service: InstanceType<typeof ImageDisplayService>): { show(): void; takeover: InstanceType<typeof ImageTakeover<TFile>> } {
    let shown = false;
    const changed = (): void => takeover.sync();
    const share = {
      get isShown(): boolean { return shown; },
      show: () => Promise.resolve('shown' as const),
      dismiss: (): boolean => {
        const was = shown;
        shown = false;
        changed();
        return was;
      },
    };
    const takeover = new ImageTakeover<TFile>(() => service, {
      share: () => share,
      readFile: () => Promise.resolve(null),
      pathOf: (file) => file.path,
      localWindowOpen: () => false,
      notice: () => undefined,
      changed: imageDisplayChanged,
    });
    takeover.sync();
    return { takeover, show: () => ((shown = true), changed()) };
  }

  it('offers taking back an image the player window shows, as its last button, and takes it back', async () => {
    const { service, file } = imageDisplay();
    // The player window, a document of its own; the overlay's entrance and exit, which jsdom does not play
    context.service.isWindowOpen.mockReturnValue(true);
    context.service.getWindow.mockReturnValue(Object.assign(new EventTarget(), { document: document.implementation.createHTMLDocument('player') }) as unknown as Window);
    HTMLElement.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), playState: 'finished', pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), commitStyles: vi.fn() }) as unknown as Animation);
    render(<PlayerWindowBar view={null} />);
    expect(takeBack()).toBeNull();
    await act(() => service.displayImageOnPlayerView(file));
    const buttons = screen.getAllByRole('button');
    expect(buttons.at(-1)).toBe(takeBack());
    act(() => fireEvent.click(takeBack()!));
    expect(service.isImageDisplayed()).toBe(false);
    expect(takeBack()).toBeNull();
    service.destroy();
  });

  it('offers taking back an image only players at an online table see, without a player window, at once, and drops it once pressed', () => {
    playerWindowStore.setState({ isOpen: false });
    context.service.isWindowOpen.mockReturnValue(false);
    act(() => tableControlsStore.setState({ online: true }));
    const { service } = imageDisplay();
    const table = onlineTable(service);
    render(<PlayerWindowBar view={null} />);
    expect(takeBack()).toBeNull();
    act(() => table.show());
    expect(takeBack()).not.toBeNull();
    act(() => fireEvent.click(takeBack()!));
    expect(service.isImageDisplayed()).toBe(false);
    expect(takeBack()).toBeNull();
    table.takeover.dispose();
    service.destroy();
  });

  it('offers taking back the loot window while players see it', () => {
    render(<PlayerWindowBar view={null} />);
    act(() => PlayerLootDisplay.get().toggle(ROPE));
    fireEvent.click(takeBack()!);
    expect(PlayerLootDisplay.get().showsInWindow()).toBe(false);
    expect(takeBack()).toBeNull();
  });

  it('switches what players see from its menu, and closes the window from its own button', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    const settings = context.settings as SettingsService;
    const before = settings.get('localPlayerView').showInitiative;
    fireEvent.click(screen.getByRole('switch', { name: 'Show initiative panel' }));
    expect(settings.get('localPlayerView').showInitiative).toBe(!before);

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close player window' }));
    expect(context.service.destroy).toHaveBeenCalledTimes(1);
  });

  it('closes its menu on Escape', () => {
    render(<PlayerWindowBar view={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table settings' }));
    expect(screen.getByRole('dialog', { name: 'Table settings' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Table settings' })).toBeNull();
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
