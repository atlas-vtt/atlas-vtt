import { describe, expect, it } from 'vitest';
import { canInteractWithFog, resolveFogPreviewAlpha } from '../../src/app/pixi/fog/fogVisibilityPolicy';

describe('fog visibility policy', () => {
  it('keeps fog fully opaque in player views regardless of GM mode flag', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: true, isGMView: true, gmOpacity: 0.3 })).toBe(1);
    expect(resolveFogPreviewAlpha({ isPlayerView: true, isGMView: false, gmOpacity: 0.3 })).toBe(1);
  });

  it('draws fog in the GM view as opaque as the GM chose', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true, gmOpacity: 0.5 })).toBe(0.5);
    expect(resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true, gmOpacity: 0.8 })).toBe(0.8);
  });

  it('keeps non-GM DM/player-mode views fully opaque', () => {
    expect(resolveFogPreviewAlpha({ isPlayerView: false, isGMView: false, gmOpacity: 0.3 })).toBe(1);
  });

  it('disables fog interaction in player views', () => {
    expect(canInteractWithFog({ isPlayerView: true })).toBe(false);
    expect(canInteractWithFog({ isPlayerView: false })).toBe(true);
  });
});
