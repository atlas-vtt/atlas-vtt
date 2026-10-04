import React from 'react';
import { useAtlasUI } from 'src/app/react/root/AtlasUIContext';
import { useWorldSettings } from './useWorldTimeSources';
import { WorldDateBar } from './WorldDateBar';

/** The date bar in the bottom toolbar's slot above the toolbar, when the bar sits at the bottom. */
export function DateBarAboveToolbar(): React.ReactElement | null {
  const { app } = useAtlasUI();
  const { showDateBar, dateBarPosition } = useWorldSettings(app);
  return showDateBar && dateBarPosition === 'bottom' ? <WorldDateBar /> : null;
}

/** The date bar on the top, left or right edge of the map. */
export function DateBarOnEdge(): React.ReactElement | null {
  const { app } = useAtlasUI();
  const { showDateBar, dateBarPosition } = useWorldSettings(app);
  if (!showDateBar || dateBarPosition === 'bottom') return null;
  const vertical = dateBarPosition === 'left' || dateBarPosition === 'right';
  return (
    <div className={`atlas-world-date-dock atlas-world-date-dock--${dateBarPosition}`}>
      <WorldDateBar vertical={vertical} />
    </div>
  );
}
