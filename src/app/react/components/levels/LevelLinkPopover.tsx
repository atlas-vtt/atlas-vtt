import React, { useId, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { RotateCw, Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { linkDirection, linkLevels, linkTargets } from '../../../levels/levelLinks';
import { flightRows, mayHoldFlight } from '../../../levels/stairFlights';
import { levelObjects } from '../../../levels/levelObjects';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { AREA_HANDLE_RADIUS } from '../../../pixi/areas/areaGeometry';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import type { LevelLink, LevelLinkDirection, SceneLevel } from '../../../types/sceneLevelTypes';
import { areaHandlePoint } from '../../../vision/polygonArea';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { levelLabel } from './levelEditing';

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts. */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace', 'Delete']);

const DIRECTIONS: readonly { value: LevelLinkDirection; label: string }[] = [
  { value: 'up', label: t('levels.stairsUp') },
  { value: 'down', label: t('levels.stairsDown') },
  { value: 'both', label: t('levels.stairsBoth') },
];

/**
 * The popover of the stairs the GM edits (store `levelLinkPopover`), beside their badge on the map:
 * which other levels they join, which way they lead, whether they are walked (`FlightRow`), and
 * Delete. Every control writes to the store at once, one undo step each.
 */
export function LevelLinkPopoverHost(): React.ReactElement {
  const linkId = useAtlasStore((state) => state.levelLinkPopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{linkId && <LevelLinkPopover key="level-link-popover" linkId={linkId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LevelLinkPopover({ linkId }: { linkId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const current = useAtlasStore((state) => levelObjects(state).levelLinks?.[linkId]);
  const levels = useAtlasStore((state) => state.levels);
  const here = useAtlasStore((state) => viewedLevelId(state));
  // While it leaves, the popover still shows the stairs it had, also when they were deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const link = shown.current;
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, linkId, (state, id) => {
    const area = levelObjects(state).levelLinks?.[id];
    return area ? { ...areaHandlePoint(area.polygon), bright: 0, dim: 0, marker: AREA_HANDLE_RADIUS } : null;
  });

  if (!link || !levels || here === null) return null;
  const joined = linkLevels(link, levels);
  const others = [...levels].reverse().filter((level) => level.id !== here);
  const toggle = (level: SceneLevel): void => {
    const next = joined.includes(level.id) ? joined.filter((id) => id !== level.id) : [...joined, level.id];
    // Kept bottom first, as the scene lists its levels.
    store.getState().updateLevelLink(link.id, { levels: levels.map((entry) => entry.id).filter((id) => id === here || next.includes(id)) });
  };

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-light-popover--stairs"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={t('levels.stairs')}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          store.getState().closeLevelLinkPopover();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <span className="atlas-light-popover__heading">{t('levels.stairsLeadTo')}</span>
      {others.map((level) => (
        <LevelRow key={level.id} name={levelLabel(levels, level)} joined={joined.includes(level.id)}
          // The last level the stairs join besides this one stays: stairs to nowhere are deleted instead.
          locked={joined.includes(level.id) && joined.length <= 2} onToggle={() => toggle(level)} />
      ))}
      <div className="atlas-light-popover__section">
        <SegmentedControl<LevelLinkDirection>
          className="atlas-segmented--fit"
          value={linkDirection(link)}
          options={DIRECTIONS}
          ariaLabel={t('levels.stairsWay')}
          onChange={(direction) => store.getState().updateLevelLink(link.id, { direction: direction === 'both' ? undefined : direction })}
        />
        {linkTargets(link, here, levels).length === 0 && <p className="atlas-light-popover__hint">{t('levels.stairsNowhere')}</p>}
        <FlightRow link={link} walkable={mayHoldFlight(link.polygon) && joined.length === 2} />
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <span />
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLevelLink(link.id)}>
          <Trash2 />
          <span>{t('common.delete')}</span>
        </Button>
      </div>
    </motion.section>
  );
}

/** One other level of the scene: whether the stairs reach it. */
function LevelRow({ name, joined, locked, onToggle }: { name: string; joined: boolean; locked: boolean; onToggle: () => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{name}</span>
      <ToggleSwitch size="s" value={joined} labelledBy={id} disabled={locked} onChange={onToggle} />
    </div>
  );
}

/** The edge stairs are stepped on from at first: the shorter of two neighbouring edges, as stairs are longer than wide. */
function firstFoot(polygon: LevelLink['polygon']): number {
  const length = (index: number): number => Math.hypot(polygon[(index + 1) % 4]!.x - polygon[index]!.x, polygon[(index + 1) % 4]!.y - polygon[index]!.y);
  return length(0) <= length(1) ? 0 : 1;
}

/**
 * Whether stairs of four corners joining two levels are walked (`LevelLink.flight`): stepped on only
 * at the end marked with a chevron and changing level in the row filled at the far end. Turn moves
 * the foot to the next edge; the rows follow the grid. Disabled, not removed, where stairs cannot be walked.
 */
function FlightRow({ link, walkable }: { link: LevelLink; walkable: boolean }): React.ReactElement {
  const store = useViewStoreHook();
  const cell = useAtlasStore((state) => state.grid?.size ?? 0);
  const id = useId();
  const walked = walkable && link.flight !== undefined;
  const setFoot = (foot: number | null): void => {
    store.getState().updateLevelLink(link.id, { flight: foot === null ? undefined : { foot, rows: flightRows(link.polygon, foot, cell) } });
  };
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{t('levels.stairsWalked')}</span>
      <Button variant="ghost" size="sm" disabled={!walked} onClick={() => setFoot(((link.flight?.foot ?? 0) + 1) % 4)}>
        <RotateCw />
        <span>{t('levels.stairsTurn')}</span>
      </Button>
      <ToggleSwitch size="s" value={walked} labelledBy={id} disabled={!walkable} onChange={() => setFoot(walked ? null : firstFoot(link.polygon))} />
    </div>
  );
}
