// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { GridScanHost } from '../../src/app/pixi/gridAlignment/GridScanLayer';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { ViewAtlasState } from '../../src/app/storeFactory';

const hosts: GridScanHost[] = [];
vi.mock('../../src/app/pixi/gridAlignment/GridScanLayer', () => ({
  GridScanLayer: { create: (host: GridScanHost) => (hosts.push(host), {}) },
}));

import { createGridScan } from '../../src/app/services/gridScan';

type Scene = Pick<ViewAtlasState, 'objects' | 'lighting'>;

const BARE = { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} };

function scene(objects: Partial<Record<keyof typeof BARE, Record<string, unknown>>> = {}, lit = false): Scene {
  return { objects: { ...BARE, ...objects }, lighting: { enabled: lit, ambient: 1 } } as unknown as Scene;
}

function rendererWith(map: object | null): PixiRendererOrchestrator {
  return {
    getMapImage: () => map,
    getViewportInstance: () => ({}),
    getCanvasElement: () => document.body.createEl('canvas'),
    getAppInstance: () => ({}),
    addDmScreenOverlay: vi.fn(),
  } as unknown as PixiRendererOrchestrator;
}

/** Whether a scan made for `state` lets a swell bend the map's picture. */
function bends(state: Scene | undefined): boolean {
  hosts.length = 0;
  createGridScan(() => state, rendererWith({}));
  return hosts[0]!.bendsMap!();
}

describe('createGridScan', () => {
  it('makes no scan for a view without a map', () => {
    expect(createGridScan(() => scene(), rendererWith(null))).toBeNull();
  });

  it('lets a swell bend the picture of a bare map only: whatever stands on it would vanish under the bent picture', () => {
    expect(bends(scene())).toBe(true);
    expect(bends(scene({ tokens: { a: {} } }))).toBe(false);
    expect(bends(scene({ drawings: { a: {} } }))).toBe(false);
    expect(bends(scene({ pins: { a: {} } }))).toBe(false);
    expect(bends(scene({ fog: { a: {} } }))).toBe(false);
    expect(bends(undefined)).toBe(false);
  });

  it('bends nothing over a lit scene, whose map the picture would show unlit', () => {
    expect(bends(scene({}, true))).toBe(false);
    // The scene's own switch off: the map shows unlit anyway.
    expect(bends(scene({}, false))).toBe(true);
  });
});
