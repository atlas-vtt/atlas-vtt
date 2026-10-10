import { describe, expect, it } from 'vitest';
import type { ViewportRect } from '../../src/app/types/viewportTypes';
import { viewportFollowCamera } from '../../src/app/utils/viewportFollowCamera';

const rect: ViewportRect = { id: 'tv', kind: 'viewport', x: 100, y: 200, width: 400, height: 300, locked: true, active: true };

describe('viewportFollowCamera', () => {
  it('frames the whole rectangle around its centre, whatever the DM\'s screen looks like', () => {
    expect(viewportFollowCamera(rect, { width: 1000, height: 300 })).toMatchObject({ centerX: 300, centerY: 350, width: 400, height: 300 });
  });

  it('zooms as far as the DM\'s screen needs to show the rectangle, and by 1 without a screen', () => {
    expect(viewportFollowCamera(rect, { width: 800, height: 900 }).scale).toBe(2);
    expect(viewportFollowCamera(rect, undefined).scale).toBe(1);
    expect(viewportFollowCamera(rect, { width: 0, height: 0 }).scale).toBe(1);
  });
});
