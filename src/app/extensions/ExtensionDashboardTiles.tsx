import React from 'react';
import { ActionCard } from '../react/components/ActionCard';
import { ObsidianIcon } from '../react/components/ObsidianIcon';
import { safely } from './SlotRegistry';
import { dashboardSlot } from './slots';
import { useSlot } from './useSlot';

/** The tiles other plugins added to the dashboard's action grid: direct children of it, so the odd-tile rule applies. */
export function ExtensionDashboardTiles(): React.ReactElement {
  const entries = useSlot(dashboardSlot);
  return (
    <>
      {entries.map(({ owner, item }) => (
        <ActionCard
          key={`${owner}:${item.id}`}
          icon={<ObsidianIcon name={item.icon} className="atlas-ext-tile-icon" />}
          title={item.title}
          description={item.description}
          onClick={() => safely(owner, `dashboard tile "${item.id}" onClick`, () => { item.onClick(); }, undefined)}
        />
      ))}
    </>
  );
}
