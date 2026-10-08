import { describe, expect, it } from 'vitest';
import { activeMapView } from '../../src/app/plugin/atlasLeaves';

const appWith = (view: unknown): never => ({ workspace: { getActiveViewOfType: () => view } }) as never;

describe('activeMapView', () => {
  it('is the active map view, and never a remote view', () => {
    const map = { isRemote: false };
    expect(activeMapView(appWith(map))).toBe(map);
    expect(activeMapView(appWith({ isRemote: true }))).toBeNull();
    expect(activeMapView(appWith(null))).toBeNull();
  });
});
