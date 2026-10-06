import { describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LaserPointerRenderer } from '../../src/app/pixi/LaserPointerRenderer';
import type { SceneSource } from '../../src/app/host/sceneSource';
import type { ViewState } from '../../src/app/types/viewState';
import { beamWidth, type BeamWidth } from '../../src/app/pixi/laser/LaserBeam';
import { COLOR_VISIONS, colorDifference, seenAs } from '../fixtures/colorVision';
import { App } from 'obsidian';
import { memoryPluginData } from '../mocks/pluginData';
import {
  DEFAULT_LASER_POINTER_SETTINGS,
  LASER_COLOR_SWATCHES,
  LASER_SIZE_MAX,
  LASER_SIZE_MIN,
  resolveLaserPointerSettings,
} from '../../src/app/tools/laserPointerSettings';

// The real beam compiles a WebGL shader, which jsdom cannot.
vi.mock('../../src/app/pixi/laser/LaserBeam', async (importOriginal) => {
  const { Container } = await import('pixi.js');
  const actual = await importOriginal<typeof import('../../src/app/pixi/laser/LaserBeam')>();
  return { ...actual, LaserBeam: class { view = new Container(); draw = vi.fn(); destroy = vi.fn(); } };
});

function settingsFrom(stored: unknown): Promise<SettingsService> {
  const settings = new SettingsService(new App(), undefined, memoryPluginData(stored));
  return settings.initialize().then(() => settings);
}

interface RendererInternals {
  pointer: { x: number; y: number } | null;
  drawBeam(now: number): void;
  beam: { draw: ReturnType<typeof vi.fn> };
}

function rendererAtZoom(zoom: number, settings: SettingsService): RendererInternals & LaserPointerRenderer {
  const viewport = { on: vi.fn(), off: vi.fn(), scale: { x: zoom } } as unknown as Viewport;
  const source: SceneSource<ViewState['activeTool']> = { get: () => 'move', subscribe: vi.fn(() => () => {}) };
  const pixiApp = { ticker: { add: vi.fn(), remove: vi.fn() }, renderer: { name: 'webgl' } } as unknown as Application;
  const readSettings = (): ReturnType<SettingsService['getLaserPointerSettings']> => settings.getLaserPointerSettings();
  const renderer = new LaserPointerRenderer(viewport, pixiApp, source, createEl('canvas'), readSettings) as unknown as RendererInternals & LaserPointerRenderer;
  Object.assign(renderer, { isToolActive: true, pointer: { x: 0, y: 0 } });
  return renderer;
}

/** The frame the renderer hands to the beam on its next draw. */
function frame(renderer: RendererInternals): { width: BeamWidth; color: string } {
  renderer.drawBeam(0);
  return renderer.beam.draw.mock.calls.at(-1)![0] as { width: BeamWidth; color: string };
}

describe('laser pointer settings', () => {
  it('keeps usable stored values and replaces the rest with defaults', () => {
    expect(resolveLaserPointerSettings({ color: '#00e5ff', size: 24 })).toEqual({ color: '#00e5ff', size: 24 });
    expect(resolveLaserPointerSettings({ color: 'red', size: Number.NaN })).toEqual(DEFAULT_LASER_POINTER_SETTINGS);
    expect(resolveLaserPointerSettings({ size: 500 }).size).toBe(LASER_SIZE_MAX);
    expect(resolveLaserPointerSettings({ size: 1 }).size).toBe(LASER_SIZE_MIN);
    expect(resolveLaserPointerSettings(undefined)).toEqual(DEFAULT_LASER_POINTER_SETTINGS);
  });

  it('are read from the settings file and default for older files', async () => {
    expect((await settingsFrom({ laserPointer: { color: '#ffe600' } })).getLaserPointerSettings())
      .toEqual({ ...DEFAULT_LASER_POINTER_SETTINGS, color: '#ffe600' });
    expect((await settingsFrom({})).getLaserPointerSettings()).toEqual(DEFAULT_LASER_POINTER_SETTINGS);
  });
});

describe('laser pointer rendering', () => {
  it('keeps the same size on screen at every zoom level', async () => {
    const settings = await settingsFrom({});
    expect(frame(rendererAtZoom(0.5, settings)).width.halfWidth).toBeCloseTo(frame(rendererAtZoom(2, settings)).width.halfWidth * 4);
  });

  it('draws with the colour and size picked in the toolbar at once', async () => {
    vi.useFakeTimers();
    const settings = await settingsFrom({});
    const renderer = rendererAtZoom(1, settings);
    const before = frame(renderer);

    settings.setLaserPointerSettings({ size: DEFAULT_LASER_POINTER_SETTINGS.size * 2, color: '#00e5ff' });
    const after = frame(renderer);
    expect(after.width.halfWidth).toBeGreaterThan(before.width.halfWidth * 1.5);
    expect(after.color).toBe('#00e5ff');
    vi.useRealTimers();
  });
});

describe('laser beam width', () => {
  it('widens the solid beam with the size and caps its glow, so wide beams stay crisp', () => {
    const narrow = beamWidth(16, 1);
    const wide = beamWidth(100, 1);
    const body = (width: BeamWidth): number => width.halfWidth * width.bodyShare;
    const glow = (width: BeamWidth): number => width.halfWidth - body(width);
    expect(body(wide)).toBeCloseTo(body(narrow) * 100 / 16);
    expect(glow(wide)).toBeLessThan(glow(narrow) * 3);
    expect(wide.bodyShare).toBeGreaterThan(narrow.bodyShare);
  });

  it('keeps the same size on screen at every zoom level', () => {
    expect(beamWidth(40, 0.5).halfWidth).toBeCloseTo(beamWidth(40, 1).halfWidth * 2);
    expect(beamWidth(40, 0.5).bodyShare).toBeCloseTo(beamWidth(40, 1).bodyShare);
  });
});

describe('laser colours', () => {
  it('stay distinguishable from each other with every kind of colour blindness', () => {
    for (const vision of COLOR_VISIONS) {
      for (const [i, a] of LASER_COLOR_SWATCHES.entries()) {
        for (const b of LASER_COLOR_SWATCHES.slice(i + 1)) {
          const difference = colorDifference(seenAs(a.value, vision), seenAs(b.value, vision));
          expect(difference, `${a.label} and ${b.label} with ${vision}`).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });
});
