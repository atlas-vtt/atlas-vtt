import React, { useEffect, useRef } from 'react';
import { TurnWatch } from '../../initiative/banner/turnBanner';
import { TurnBannerDisplay } from '../../initiative/banner/turnBannerElement';
import { defeatedOnMap } from '../../initiative/defeatedOnMap';
import { followTurn } from '../../initiative/followTurn';
import { DEFAULT_TURN_OPTIONS } from '../../initiative/turnOptions';
import { SettingsService } from '../../services/SettingsService';
import type { ViewAtlasState } from '../../storeFactory';
import { portraitSrc } from '../../utils/portraitSrc';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useViewStoreHook } from '../ViewStoreContext';

/**
 * What a turn change does on the GM's map: the turn banner names whose turn it is for a moment,
 * and the view follows the turn where the GM chose so (the tracker's options). Nothing happens on
 * a scene's load or when the view first meets a fight already running.
 */
export function TurnAnnouncer(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const store = useViewStoreHook();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const display = new TurnBannerDisplay(host, (imagePath) => portraitSrc(app, imagePath));
    const watch = new TurnWatch();
    const look = (state: ViewAtlasState): void => {
      const banner = watch.next(state, { kind: 'gm' });
      if (!state.initiative?.isActive) {
        if (display.showing) display.hide();
        return;
      }
      if (!banner) return;
      const options = SettingsService.forApp(app)?.initiativeTurnOptions() ?? DEFAULT_TURN_OPTIONS;
      if (options.banner) display.show(banner);
      if (options.followTurn) followTurn(view?.renderer?.getViewportInstance(), state, (tokenId) => view?.renderer?.canvasShowsToken(tokenId) ?? false, defeatedOnMap(app, state));
    };
    look(store.getState());
    const stop = store.subscribe(look);
    return () => {
      stop();
      display.destroy();
    };
  }, [app, view, store]);

  return <div ref={hostRef} className="atlas-bottom-toolbar-row__above" aria-live="polite" />;
}
