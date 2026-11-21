import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../react/root/AtlasUIContext';
import { DiceRollDisplay } from '../../../react/components/dice/DiceRollDisplay';
import { RollFeed } from '../../../react/components/dice/rollFeed';
import type { OffMapRolls } from '../../../services/statblockRolls';
import { collectionRolls } from '../../../services/collectionRolls';
import { OffMapRollsContext } from '../../render/shared/offMapRolls';

export interface PaneDiceRollsProps {
  app: App;
  /** The pane's collection, whose dice rules roll while no map is open. */
  collectionId: string | null;
  children: React.ReactNode;
}

/**
 * The rolls of the statblock beside its note that no map on screen shows
 * (`statblockRolls.ts`): rolled by the collection's dice set (or the template's) while no map is
 * open, and thrown at the top of the pane by the dice display maps use, so a
 * click on a die is always seen. A map on screen shows its own rolls. The
 * display mounts with the first roll (`RollFeed`).
 */
export function PaneDiceRolls({ app, collectionId, children }: PaneDiceRollsProps): React.JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [rolled, setRolled] = useState(false);
  const [feed] = useState(() => new RollFeed());
  const collection = useRef(collectionId);
  useLayoutEffect(() => {
    collection.current = collectionId;
  });

  const offMap = useMemo((): OffMapRolls => ({
    ...collectionRolls(app, () => collection.current),
    show: (result, muted) => {
      if (!feed.show(result, muted)) setRolled(true);
    },
  }), [app, feed]);
  const ui = useMemo((): AtlasUIContextValue => ({ app, view: null, pixiApp: null, renderer: null }), [app]);

  return (
    <OffMapRollsContext.Provider value={offMap}>
      {children}
      <div ref={setHost} className="atlas-sb-pane-rolls" />
      {host && rolled && (
        <AtlasUIContext.Provider value={ui}>
          <DiceRollDisplay container={host} subscribe={feed.subscribe} cardSounds />
        </AtlasUIContext.Provider>
      )}
    </OffMapRollsContext.Provider>
  );
}
