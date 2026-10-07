import { describe, expect, it, vi } from 'vitest';
import { sameTrackedSlice as areTemporalSnapshotsEqual } from '../../src/app/stores/history/trackedSlice';

describe('areTemporalSnapshotsEqual', () => {
  it('returns true when tracked references are unchanged', () => {
    const sharedObjects = { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} };
    const sharedGrid = { size: 70, offsetX: 0, offsetY: 0 };
    const sharedWidgetValues = { action: 1 };

    const past = {
      objects: sharedObjects,
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    const current = {
      objects: sharedObjects,
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    expect(areTemporalSnapshotsEqual(past, current)).toBe(true);
  });

  it('returns false when a tracked reference changes', () => {
    const sharedGrid = { size: 70, offsetX: 0, offsetY: 0 };
    const sharedWidgetValues = { action: 1 };

    const past = {
      objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} },
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    const current = {
      objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} },
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    expect(areTemporalSnapshotsEqual(past, current)).toBe(false);
  });

  it('does not rely on JSON serialization in the hot path', () => {
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    const sharedObjects = { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} };
    const sharedGrid = { size: 70, offsetX: 0, offsetY: 0 };
    const sharedWidgetValues = { action: 1 };

    const past = {
      objects: sharedObjects,
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    const current = {
      objects: sharedObjects,
      grid: sharedGrid,
      background: 'map.png',
      widgetValues: sharedWidgetValues,
    };

    expect(areTemporalSnapshotsEqual(past, current)).toBe(true);
    expect(stringifySpy).not.toHaveBeenCalled();
  });
});
