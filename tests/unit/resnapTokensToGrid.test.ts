import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { snapTokenCenter, tokenCenterShift } from '../../src/app/grid/gridPlacement';
import { axialToPixel, createHexLayout, nearestHexCenter, type Point } from '../../src/app/grid/hexGeometry';

const SIZE = 64;
const layout = createHexLayout('hex-vertical', SIZE, 7, 3);
const gridSystem = {
  snapTokenCenter: (x: number, y: number, tokenSize: number): Point =>
    snapTokenCenter({ x, y }, tokenSize, 'hex-vertical', SIZE, (point) => nearestHexCenter(layout, point)),
};

function resnap(tokens: Record<string, { x: number; y: number; size?: number }>): ReturnType<typeof vi.fn> {
  const setTokenPositions = vi.fn();
  const store = createStore(subscribeWithSelector(() => ({
    grid: { type: 'hex-vertical', size: SIZE, snapToGrid: true },
    objects: { tokens },
    setTokenPositions,
  })));
  const renderer = new PixiRendererOrchestrator({} as any, {} as any, new EventEmitter(), store as any, 'test');
  Object.assign(renderer as any, { gridSystem, tokenRenderer: {} });
  (renderer as any).resnapTokensToGrid();
  return setTokenPositions;
}

describe('re-snapping tokens after a grid change or a scene load', () => {
  it('keeps Large and Gargantuan tokens on hex vertices and Medium and Huge ones on hexes', () => {
    const hex = axialToPixel(layout, { q: 3, r: 2 });
    const shift = tokenCenterShift('hex-vertical', SIZE, 1.5);
    const vertex = { x: hex.x + shift.x, y: hex.y + shift.y };

    const setTokenPositions = resnap({
      medium: { ...hex, size: 1 },
      large: { ...vertex, size: 1.5 },
      huge: { ...hex, size: 2 },
      gargantuan: { ...vertex, size: 2.5 },
    });

    expect(setTokenPositions).not.toHaveBeenCalled();
  });

  it('moves a Large token that stands on a hex centre onto a vertex', () => {
    const hex = axialToPixel(layout, { q: 3, r: 2 });
    const setTokenPositions = resnap({ large: { ...hex, size: 1.5 } });

    const [[updates]] = setTokenPositions.mock.calls as [[Array<{ id: string } & Point>]];
    expect(updates[0]).toEqual({ id: 'large', ...gridSystem.snapTokenCenter(hex.x, hex.y, 1.5) });
  });
});
