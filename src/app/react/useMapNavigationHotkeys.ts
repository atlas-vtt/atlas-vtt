import { useEffect } from 'react';
import type { AtlasView } from '../atlas-view';
import { canRunMapHotkeys, matchesMapHotkey } from '../keyboard/mapHotkeys';
import { focusToken } from '../pixi/tokenFocus';
import { mapFit } from '../pixi/fitMapRect';
import { allowZoom } from '../pixi/zoomRange';
import { addTokenHighlight } from '../pixi/utils/tokenHighlight';
import type { SettingsService } from '../services/SettingsService';
import type { ViewAtlasStore } from '../storeFactory';
import { mapTokens } from '../tokens/offMap';
import { viewedLevelId } from '../levels/sceneLevels';
import { levelObjects } from '../levels/levelObjects';

/** Shows the level `step` places above (1) or below (-1) the one shown; nothing past the top or bottom floor. */
function stepLevel(store: ViewAtlasStore, step: 1 | -1): void {
  const state = store.getState();
  const levels = state.levels ?? [];
  const next = levels[levels.findIndex((level) => level.id === viewedLevelId(state)) + step];
  if (levels.length > 1 && next) state.setViewedLevel(next.id);
}

/** Map navigation keyboard shortcuts (Shift+1: fit map, Shift+2: zoom to selected token). */
export function useMapNavigationHotkeys(view: AtlasView | null, store: ViewAtlasStore, settings: SettingsService | undefined): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!canRunMapHotkeys(e, view?.viewId)) return;

      if (!store.getState().isPlayerView && (matchesMapHotkey(e, 'levelUp', settings) || matchesMapHotkey(e, 'levelDown', settings))) {
        e.preventDefault();
        stepLevel(store, matchesMapHotkey(e, 'levelUp', settings) ? 1 : -1);
      } else if (matchesMapHotkey(e, 'fitMap', settings)) {
        // Shift+1: Fit entire map in view with smooth animation
        e.preventDefault();
        const vp = view?.renderer?.getViewportInstance?.();
        const rect = view?.renderer?.getMapRect?.();
        if (!vp || !rect) return;

        const fit = mapFit(vp, rect);
        allowZoom(vp, fit.scale);
        // Use pixi-viewport's animate method for smooth transition
        vp.animate({
          position: { x: fit.x, y: fit.y },
          scale: fit.scale,
          time: 400,
          ease: 'easeInOutCubic',
        });
      } else if (matchesMapHotkey(e, 'fitToken', settings)) {
        // Shift+2: Zoom to selected token with smooth animation
        e.preventDefault();
        const state = store.getState();
        const tokenId = state.selectedIds[0];
        if (tokenId === undefined) return;

        const token = mapTokens(levelObjects(state))[tokenId];
        const { grid } = state;
        if (!token || !view) return;

        const vp = view?.renderer?.getViewportInstance?.();
        if (!vp) return;

        focusToken(vp, token, grid?.size ?? 70);

        // Add highlight effect to the token
        addTokenHighlight(view, tokenId, { highlightDuration: 2000, glowThickness: 4 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, store, settings]);
}
