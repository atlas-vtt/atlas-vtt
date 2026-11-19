import React from 'react';
import { ONLINE_BAR } from '../../toolbar/toolbarCatalog';
import { SideBarSlot } from '../../packages/components/toolbar/SideBarSlot';
import { useToolbarLayout } from '../../packages/components/toolbar/useToolbarLayout';
import { useOnlinePlayOn } from '../hooks/useOnlinePlayOn';

/**
 * Online play's place at the row's left edge (`BottomToolbarRow`'s lead). Online play builds its
 * button itself and mounts it in here (`dockDom.place`), so the toolbar editor hides and shows it
 * like the other bars beside the toolbar. Nothing while online play is off.
 */
export function OnlinePlaySlot(): React.ReactElement | null {
  if (!useOnlinePlayOn()) return null;
  return <SideBarSlot id={ONLINE_BAR.id} contentClassName="atlas-online-place">{null}</SideBarSlot>;
}

/**
 * The room online play's button takes, first in the row's start slot, so the undo/redo bar and the
 * toolbar stand clear of it; none while the button is hidden or online play is off.
 */
export function OnlinePlayRoom(): React.ReactElement | null {
  const on = useOnlinePlayOn();
  const { layout } = useToolbarLayout();
  if (!on || layout.hidden.has(ONLINE_BAR.id)) return null;
  return <div className="atlas-online-room" aria-hidden="true" />;
}
