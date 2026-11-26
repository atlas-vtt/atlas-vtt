import React, { useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { DoorOpen } from 'lucide-react';
import { useStore } from 'zustand';
import { t } from '../../../i18n';
import { hasLevels, viewedLevelId } from '../../../levels/sceneLevels';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { BADGE_SHARE } from '../../../pixi/lighting/DoorIcons';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import { useAtlasStore } from '../../../react/ViewStoreContext';
import { doorAskStore, type DoorAsk } from './doorAskStore';

/** Keys the popover's buttons use themselves; they must not reach the map's shortcuts. */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab']);

/**
 * Players' asks to open doors on the map this view shows: one popover beside each door asked about,
 * on its level. The GM opens the door or keeps it shut from there; the notice that came with the ask
 * brings the GM here.
 */
export function DoorAskPopoverHost(): React.ReactElement {
  const asks = useStore(doorAskStore, (state) => state.asks);
  const mapPath = useAtlasStore((state) => state.mapPath);
  const level = useAtlasStore((state) => (hasLevels(state.levels) ? viewedLevelId(state) : null));
  const here = asks.filter((ask) => ask.mapPath === mapPath && (level === null || ask.level === null || ask.level === level));
  return <AnimatePresence>{here.map((ask) => <DoorAskPopover key={ask.key} ask={ask} />)}</AnimatePresence>;
}

function DoorAskPopover({ ask }: { readonly ask: DoorAsk }): React.ReactElement {
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, ask.key, (state, _id, zoom) => ({ x: ask.at.x, y: ask.at.y, bright: 0, dim: 0, marker: (state.grid?.size ?? 70) * BADGE_SHARE * zoom }));
  const heading = t('online.doorAskHeading', { player: ask.who });
  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-door-ask"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={heading}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (OWN_KEYS.has(event.key)) event.stopPropagation();
      }}
    >
      <div className="atlas-door-ask__heading">
        <DoorOpen aria-hidden="true" />
        <span>{heading}</span>
      </div>
      <div className="atlas-door-ask__choices">
        <Button variant="ghost" size="sm" onClick={() => ask.answer(false)}>{t('online.doorAskDeny')}</Button>
        <Button variant="default" size="sm" className="atlas-door-ask__open" onClick={() => ask.answer(true)}>{t('online.doorAskAllow')}</Button>
      </div>
    </motion.section>
  );
}
