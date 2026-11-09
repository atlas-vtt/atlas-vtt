import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Combine, House, Plus } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { RoomList } from '../../packages/components/toolbar/RoomList';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import { levelObjects } from '../../levels/levelObjects';
import { MAX_ROOMS, roomList } from '../../lighting/rooms';
import { t } from '../../i18n';

/**
 * The Rooms panel, while the lighting tool works in its Rooms mode in the GM's view: the rooms are
 * worked with beside the map, the tool's menu only picks how a stroke carves. `UIRoot` mounts it
 * outside the toolbar's tooltip provider.
 */
export function RoomsPanelHost(): React.ReactElement {
  const shown = useAtlasStore((state) => state.lightingTool.mode === 'rooms' && state.activeTool === 'wall' && state.isGMView && !state.isPlayerView);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{shown && <RoomsPanel key="rooms" />}</AnimatePresence>
    </TooltipProvider>
  );
}

/**
 * The rooms of the level shown: which one a stroke carves into, their names, and joining, splitting,
 * hiding and deleting them. It stands in one place, the top left of the map below the scene tabs
 * (the lighting settings open at the top right), and is not dragged.
 */
function RoomsPanel(): React.ReactElement {
  const count = useAtlasStore((state) => roomList(levelObjects(state).rooms).length);
  const startsNew = useAtlasStore((state) => state.activeRoomId === null);
  const actions = useViewStoreHook().getState;
  const windowVariants = useDialogWindowVariants();

  return (
    <motion.section
      className="atlas-light-panel atlas-rooms-panel"
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={t('rooms.list')}
    >
      <header className="atlas-light-panel__header atlas-rooms-panel__header">
        <House className="atlas-light-panel__icon" />
        <h2 className="atlas-light-panel__title">{t('rooms.list')}</h2>
        {count > 0 && <span className="atlas-rooms-panel__count">{t('rooms.count', { count, max: MAX_ROOMS })}</span>}
        <LabelTooltip label={t('rooms.newTip')} describe>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('rooms.new')}
            aria-pressed={count > 0 && startsNew}
            disabled={count >= MAX_ROOMS}
            onClick={() => actions().setActiveRoom(null)}
          >
            <Plus />
          </Button>
        </LabelTooltip>
      </header>
      <div className="atlas-rooms-panel__body">
        <RoomList />
        {count > 1 && (
          <Button variant="ghost" size="sm" className="atlas-rooms-panel__join" onClick={() => actions().joinRooms()}>
            <Combine />
            {t('rooms.joinAll')}
          </Button>
        )}
      </div>
    </motion.section>
  );
}
