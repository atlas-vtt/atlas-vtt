import React, { useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';
import { levelsBelow } from '../../levels/levelStack';
import { viewedLevelId } from '../../levels/sceneLevels';
import { Button } from '../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../packages/components/primitives/dialogMotion';
import { SegmentedControl } from '../../packages/components/primitives/SegmentedControl';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import { areaHandlePoint } from '../../vision/polygonArea';
import { AREA_HANDLE_RADIUS } from '../areas/areaGeometry';
import { useMapPopoverPosition } from '../lighting/useLightPopoverPosition';

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts. */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace', 'Delete']);

type Kind = 'open' | 'floor';

const KINDS: readonly { value: Kind; label: string }[] = [
  { value: 'open', label: t('openings.open') },
  { value: 'floor', label: t('openings.floor') },
];

/**
 * The popover of the opening or floor the GM edits (store `levelSurfacePopover`), beside its badge
 * on the map: whether it opens the level to the levels below or is floor over an opening, and
 * Delete. Every control writes to the store at once, one undo step each.
 */
export function LevelSurfacePopoverHost(): React.ReactElement {
  const surfaceId = useAtlasStore((state) => state.levelSurfacePopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{surfaceId && <LevelSurfacePopover key="level-surface-popover" surfaceId={surfaceId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LevelSurfacePopover({ surfaceId }: { surfaceId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const current = useAtlasStore((state) => levelObjects(state).levelSurfaces?.[surfaceId]);
  // On the lowest level nothing lies below an opening.
  const lowest = useAtlasStore((state) => {
    const viewed = viewedLevelId(state);
    return !state.levels || viewed === null || levelsBelow(state.levels, viewed).length === 0;
  });
  // While it leaves, the popover still shows the area it had, also when that area was deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const surface = shown.current;
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, surfaceId, (state, id) => {
    const area = levelObjects(state).levelSurfaces?.[id];
    return area ? { ...areaHandlePoint(area.polygon), bright: 0, dim: 0, marker: AREA_HANDLE_RADIUS } : null;
  });

  if (!surface) return null;
  const kind: Kind = surface.open === true ? 'open' : 'floor';

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-light-popover--opening"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={t('openings.title')}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          store.getState().closeLevelSurfacePopover();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <SegmentedControl<Kind>
        className="atlas-segmented--fit"
        value={kind}
        options={KINDS}
        ariaLabel={t('openings.kind')}
        onChange={(value) => store.getState().updateLevelSurface(surface.id, { open: value === 'open' })}
      />
      {kind === 'open' && lowest && <p className="atlas-light-popover__hint">{t('openings.chasm')}</p>}
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <span />
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLevelSurface(surface.id)}>
          <Trash2 />
          <span>{t('common.delete')}</span>
        </Button>
      </div>
    </motion.section>
  );
}
