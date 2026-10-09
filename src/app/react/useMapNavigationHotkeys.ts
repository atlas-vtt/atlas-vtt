import { useEffect } from 'react';
import type { AtlasView } from '../atlas-view';
import { canRunMapHotkeys, matchesMapHotkey } from '../keyboard/mapHotkeys';
import { focusToken } from '../pixi/tokenFocus';
import { mapFit } from '../pixi/fitMapRect';
import { addTokenHighlight } from '../pixi/utils/tokenHighlight';
import type { SettingsService } from '../services/SettingsService';
import type { ViewAtlasStore } from '../storeFactory';

/** Map navigation keyboard shortcuts (Shift+1: fit map, Shift+2: zoom to selected token). */
export function useMapNavigationHotkeys(view: AtlasView | null, store: ViewAtlasStore, settings: SettingsService | undefined): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!canRunMapHotkeys(e, view?.viewId)) return;

      if (matchesMapHotkey(e, 'fitMap', settings)) {
        // Shift+1: Fit entire map in view with smooth animation
        e.preventDefault();
        const vp = view?.renderer?.getViewportInstance?.();
        const rect = view?.renderer?.getMapRect?.();
        if (!vp || !rect) return;

        const fit = mapFit(vp, rect);
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
        const { selectedIds, objects, grid } = store.getState();
        const tokenId = selectedIds[0];
        if (tokenId === undefined) return;

        const token = objects.tokens[tokenId];
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
