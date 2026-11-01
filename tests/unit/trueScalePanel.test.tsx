// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { AtlasView } from '../../src/app/atlas-view';
import type { TvSetupScreen } from '../../src/app/services/tableTvFrame';
import { playerWindowStore, resetPlayerWindowStore } from '../../src/app/stores/playerWindowStore';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const presentTab = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentTab }));

const { TrueScalePanel } = await import('../../src/app/packages/components/true-scale/TrueScalePanel');

const KEY = '3840x2160';

describe('TrueScale panel', () => {
  let settings: SettingsService;
  let showSetup: ReturnType<typeof vi.fn<(state: TvSetupScreen | null) => void>>;
  let view: AtlasView;

  const renderPanel = (): void => {
    render(<TooltipProvider><TrueScalePanel settings={settings} host={{ showSetup, setupScreenKey: () => KEY }} view={view} /></TooltipProvider>);
  };
  const lastScreen = (): TvSetupScreen | null | undefined => showSetup.mock.calls.at(-1)?.[0];

  beforeEach(() => {
    settings = new SettingsService(createInMemoryApp().app);
    showSetup = vi.fn<(state: TvSetupScreen | null) => void>();
    view = { app: {}, tabMetaStore: createStore(() => ({ activeTabId: 'a' })) } as unknown as AtlasView;
    playerWindowStore.setState({ isOpen: true, shownTabId: 'a' });
    presentTab.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetPlayerWindowStore();
    vi.useRealTimers();
  });

  it('says whether this screen is set up, and that players are on another map', () => {
    renderPanel();
    expect(screen.getByText('This screen is not measured yet')).toBeTruthy();
    act(() => settings.setTvScreenSetup(KEY, { pxPerMm: 3 }));
    expect(screen.getByText('Measured · 3840×2160')).toBeTruthy();
    act(() => playerWindowStore.setState({ shownTabId: 'b' }));
    expect(screen.getByText('Players are on another map')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show this map' }));
    expect(presentTab).toHaveBeenCalledWith(view.app, view, 'a');
  });

  it('starts the set-up where True scale is switched on for a screen never set up', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('switch', { name: 'Show the map at true scale' }));
    expect(screen.getByText('Which way is up?')).toBeTruthy();
    expect(lastScreen()).toEqual({ kind: 'orientation' });
    expect(settings.getTableTvDevice().trueScale).toBe(false);
  });

  it('fits the card with the dial and stores the fit with Done', () => {
    settings.setTvScreenSetup(KEY, { pxPerMm: 3, rotation: 90 });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Measure the screen again…' }));
    expect(lastScreen()).toEqual({ kind: 'fit', pxPerMm: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Larger' }));
    const larger = lastScreen();
    expect(larger?.kind === 'fit' && larger.pxPerMm).toBeCloseTo(3.06);
    fireEvent.click(screen.getByRole('button', { name: 'Larger' }));
    expect((lastScreen() as { pxPerMm: number }).pxPerMm).toBeGreaterThan(3.06);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const device = settings.getTableTvDevice();
    expect(device.screens[KEY]?.pxPerMm).toBeCloseTo(3 * 1.02 ** 2);
    expect(device.screens[KEY]?.rotation).toBe(90);
    expect(device.trueScale).toBe(true);
    expect(lastScreen()).toBeNull();
    expect(screen.getByText('Measured · 3840×2160')).toBeTruthy();
  });

  it('turns the TV back and clears its screen on Cancel', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Measure the screen…' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }));
    expect(settings.getTableTvDevice().screens[KEY]?.rotation).toBe(90);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(lastScreen()?.kind).toBe('fit');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(settings.getTableTvDevice().screens[KEY]?.rotation).toBe(0);
    expect(settings.getTableTvDevice().screens[KEY]?.pxPerMm).toBeUndefined();
    expect(lastScreen()).toBeNull();
    expect(screen.getByText('This screen is not measured yet')).toBeTruthy();
  });

  it('writes the cell on the glass', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: '25 mm' }));
    expect(settings.getTableTvDevice().cellMm).toBe(25);
  });

  it('turns the TV with the arrows and shows its arrow for a moment', () => {
    vi.useFakeTimers();
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: 'Down' }));
    expect(settings.getTableTvDevice().screens[KEY]?.rotation).toBe(180);
    expect(lastScreen()).toEqual({ kind: 'orientation' });
    act(() => { vi.advanceTimersByTime(1999); });
    expect(lastScreen()).toEqual({ kind: 'orientation' });
    act(() => { vi.advanceTimersByTime(1); });
    expect(lastScreen()).toBeNull();
  });
});
