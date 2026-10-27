import { OutlineFilter } from 'pixi-filters';
import { getObsidianAccentColor, cssColorToHexNumber } from './colorUtils';
import type { AtlasView } from '../../atlas-view';
import type { ViewAtlasState } from '../../storeFactory';
import { requestRender } from '../RenderScheduler';
import { addFilter, removeFilter } from './filterList';
import { everyLevelObjects } from '../../levels/levelObjects';
import { hasLevels, onLevel, resolveLevel, viewedLevelId } from '../../levels/sceneLevels';

/**
 * Configuration options for the zoom-to-token functionality
 */
interface ZoomToTokenOptions {
  zoomLevel?: number;
  highlightDuration?: number;
  glowThickness?: number;
}

/** What showing a token's level reads and writes of a view's state. */
export type TokenLevelState = Pick<ViewAtlasState, 'objects' | 'levels' | 'viewedLevel' | 'setViewedLevel'>;

/**
 * Shows the level token `tokenId` stands on, where the view (`state`) shows another: a token is
 * found on its own floor. Returns whether it showed another level.
 */
export function showLevelOfToken(state: TokenLevelState, tokenId: string): boolean {
  const token = everyLevelObjects(state).tokens[tokenId];
  const shown = viewedLevelId(state);
  if (!token || !hasLevels(state.levels) || shown === null || onLevel(token, shown, state.levels)) return false;
  state.setViewedLevel(resolveLevel(state.levels, token.level));
  return true;
}

/**
 * Zooms the viewport to center on a token and applies an animated glow highlight, on the
 * token's own level where the view showed another.
 * The highlight uses the Obsidian accent color and pulses for the specified duration.
 * 
 * @param view - The Atlas view instance containing the renderer
 * @param tokenId - The ID of the token to zoom to and highlight
 * @param tokenPosition - The world coordinates of the token { x, y }
 * @param options - Optional configuration for zoom level and highlight duration
 */
export function zoomToTokenWithHighlight(
  view: AtlasView | null,
  tokenId: string,
  tokenPosition: { x: number; y: number },
  options: ZoomToTokenOptions = {}
): void {
  const {
    zoomLevel = 2.5,
    highlightDuration = 3000,
    glowThickness = 4,
  } = options;

  const viewport = view?.renderer?.getViewportInstance?.();
  if (!view || !viewport) {
    console.warn('Viewport not available for zoom-to-token');
    return;
  }

  showLevelOfToken(view.getStore().getState(), tokenId);
  viewport.setZoom(zoomLevel);
  viewport.moveCenter(tokenPosition.x, tokenPosition.y);

  whenSpriteShown(view, tokenId, () => addTokenHighlight(view, tokenId, { highlightDuration, glowThickness }));
}

/** How long a highlight waits for the sprite of a token on a level just shown, which is drawn once its art has loaded. */
const SPRITE_WAIT_MS = 2000;

/** Calls `then` once token `tokenId` has a sprite on the canvas, or after `ms` without one: a token on a level just shown is drawn once its art has loaded. */
export function whenSpriteShown(view: AtlasView, tokenId: string, then: () => void, ms = SPRITE_WAIT_MS): void {
  const hasSprite = (): boolean => Boolean(view.renderer?.getTokenRenderer()?.getTokenSprites()[tokenId]);
  const ticker = view.renderer?.getAppInstance()?.ticker;
  if (!ticker || hasSprite()) {
    then();
    return;
  }
  const started = performance.now();
  const check = (): void => {
    if (!hasSprite() && performance.now() - started < ms) return;
    ticker.remove(check);
    then();
  };
  ticker.add(check);
}

/**
 * Adds an animated glow highlight to a token sprite.
 * The glow pulses and automatically removes itself after the specified duration.
 * 
 * @param view - The Atlas view instance containing the renderer
 * @param tokenId - The ID of the token to highlight
 * @param options - Configuration for highlight duration and glow thickness
 */
export function addTokenHighlight(
  view: AtlasView | null,
  tokenId: string,
  options: { highlightDuration?: number; glowThickness?: number } = {}
): void {
  const { highlightDuration = 3000, glowThickness = 4 } = options;

  try {
    const tokenRenderer = view?.renderer?.getTokenRenderer();
    if (!tokenRenderer) return;

    const tokenSprite = tokenRenderer.getTokenSprites()[tokenId];
    if (!tokenSprite) return;

    const accentColor = getObsidianAccentColor();
    const hexColor = cssColorToHexNumber(accentColor);
    const glowFilter = new OutlineFilter({ thickness: glowThickness, color: hexColor, quality: 1 });

    addFilter(tokenSprite, glowFilter);

    let time = 0;
    const app = view?.renderer?.getAppInstance();
    const animateGlow = (): void => {
      time += 0.05;
      glowFilter.thickness = glowThickness + Math.sin(time) * 2;
      glowFilter.alpha = 0.8 + Math.sin(time) * 0.2;
      // Filter properties are not tracked by the scene graph
      if (app) requestRender(app);
    };

    const ticker = app?.ticker;
    if (ticker) {
      ticker.add(animateGlow);

      window.setTimeout(() => {
        ticker.remove(animateGlow);
        removeFilter(tokenSprite, glowFilter);
        glowFilter.destroy();
      }, highlightDuration);
    }
  } catch (e) {
    console.error('Could not add highlight effect:', e);
  }
}
