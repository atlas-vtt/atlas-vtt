import React from 'react';
import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { addTokenHighlight, zoomToTokenWithHighlight } from '../../../pixi/utils/tokenHighlight';
import { useMapResources } from '../../../resources/useMapResources';
import { toTokenVitals } from '../../../services/statblockVitalsSync';
import { StatblockFeedMenu } from '../../../statblocks/editor/create/StatblockFeedMenu';
import { LinkedStatblock } from '../../../statblocks/render/LinkedStatblock';
import { isOffMap } from '../../../tokens/offMap';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { StatblockFeeds } from './StatblockFeeds';
import type { LoadedStatblock } from './useDMScreenStatblocks';

interface DMStatblocksPaneProps {
  app: App;
  /** What `useFightStatblocks` shows, and its switch. */
  shown: readonly [string, LoadedStatblock][];
  scopeSwitch: React.ReactNode;
  loading: boolean;
  onClose: () => void;
}

/** Left side of the DM screen's first page: the statblocks of the tokens on the map. */
export function DMStatblocksPane({ app, shown, scopeSwitch, loading, onClose }: DMStatblocksPaneProps): React.JSX.Element {
  const { view } = useAtlasUI();
  const tokens = useAtlasStore((state) => state.objects?.tokens || {});
  const updateToken = useAtlasStore((state) => state.updateToken);
  const definitions = useMapResources();
  return (
    <div className="atlas-dm-statblocks-section">
      {loading ? (
        <div className="atlas-dm-loading">{t('dashboard.loading')}</div>
      ) : (
        <div className="atlas-dm-statblocks-grid">
          {scopeSwitch}
          {shown.length > 0 && (
            <StatblockFeeds>
              {shown.map(([path, statblock]) => (
                <StatblockFeedMenu key={path} app={app} path={path} onOpened={onClose}>
                  <LinkedStatblock
                    app={app}
                    path={path}
                    variant="feed"
                    tokens={statblock.tokens.map(toTokenVitals)}
                    originContext={statblock.originContext}
                    tokenActions={{
                      definitions,
                      onUpdateToken: (id, updates) => updateToken(id, updates),
                      onHoverToken: (id) => addTokenHighlight(view, id, { highlightDuration: 800 }),
                      onLocateToken: (id) => {
                        const token = tokens[id];
                        // A combatant kept beside the map has no place on it to show
                        if (!token || isOffMap(token)) return;
                        zoomToTokenWithHighlight(view, id, { x: token.x, y: token.y });
                        onClose();
                      },
                    }}
                  />
                </StatblockFeedMenu>
              ))}
            </StatblockFeeds>
          )}
        </div>
      )}
    </div>
  );
}
