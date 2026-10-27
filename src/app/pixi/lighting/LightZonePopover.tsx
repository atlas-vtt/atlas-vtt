import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { DEFAULT_AMBIENT_COLOR } from '../../lighting/sceneLightingOptions';
import { TIMES_OF_DAY, type TimeOfDay } from '../../lighting/timesOfDay';
import { Button } from '../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../packages/components/primitives/dialogMotion';
import { SegmentedControl } from '../../packages/components/primitives/SegmentedControl';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import type { LightZoneChanges } from '../../types/lightingTypes';
import { SliderField } from './lightingPanelFields';
import { useColourPick, useGestureTransactions, type ColourPick } from './useGestureTransactions';
import { useZonePopoverPosition } from './useLightPopoverPosition';
import { levelObjects } from '../../levels/levelObjects';

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts. */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete']);

/**
 * The popover of the light zone the GM edits (store `lightZonePopover`), beside the zone's
 * handle on the map: its name, its ambient light by time of day or finely, the light's tint,
 * and Delete. Every control writes to the store at once, and a gesture is one undo step.
 */
export function LightZonePopoverHost(): React.ReactElement {
  const zoneId = useAtlasStore((state) => state.lightZonePopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{zoneId && <LightZonePopover key="light-zone-popover" zoneId={zoneId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LightZonePopover({ zoneId }: { zoneId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const current = useAtlasStore((state) => levelObjects(state).lightZones?.[zoneId]);
  // While it leaves, the popover still shows the zone it had, also when that zone was deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const zone = shown.current;
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useZonePopoverPosition(ref, zoneId);

  const { onSliderPointerDown, beginPick, endPick } = useGestureTransactions(store);

  if (!zone) return null;
  const update = (changes: LightZoneChanges): void => store.getState().updateLightZone(zone.id, changes);
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === zone.ambient)?.value ?? 'custom';

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-light-popover--zone"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label="Light zone"
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          store.getState().closeLightZonePopover();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <ZoneName name={zone.name ?? ''} onChange={(name) => update({ name })} />
      <div className="atlas-light-popover__section">
        <SegmentedControl<TimeOfDay | 'custom'>
          className="atlas-segmented--fit"
          value={time}
          options={TIMES_OF_DAY}
          ariaLabel="Time of day in the zone"
          onChange={(value) => {
            const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value);
            if (stop) update({ ambient: stop.ambient });
          }}
        />
        <div className="atlas-light-popover__ambient">
          <SliderField label="Ambient light" value={Math.round(zone.ambient * 100)} min={0} max={100} step={1} display={`${Math.round(zone.ambient * 100)} %`}
            onPointerDown={onSliderPointerDown} onChange={(percent) => update({ ambient: percent / 100 })} />
          <ZoneColour color={zone.ambientColor ?? DEFAULT_AMBIENT_COLOR} onChange={(ambientColor) => update({ ambientColor })}
            onPickStart={beginPick} onPickEnd={endPick} />
        </div>
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <span />
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLightZone(zone.id)}>
          <Trash2 />
          <span>Delete</span>
        </Button>
      </div>
    </motion.section>
  );
}

/** The zone's name: committed on Enter or when the field is left; an empty one takes the name away. */
function ZoneName({ name, onChange }: { name: string; onChange: (name: string | undefined) => void }): React.ReactElement {
  const id = useId();
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);
  const commit = (): void => {
    const next = text.trim();
    setText(next);
    if (next !== name) onChange(next === '' ? undefined : next);
  };
  return (
    <label className="atlas-light-popover__range" htmlFor={id}>
      <span>Name</span>
      <input id={id} type="text" autoComplete="off" value={text} placeholder="Cave, lit hall…"
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commit();
        }} />
    </label>
  );
}

/** The tint of the zone's ambient light, from the system picker. */
function ZoneColour({ color, ...pick }: ColourPick & { color: string }): React.ReactElement {
  const input = useColourPick(pick);
  return (
    <LabelTooltip label="Ambient colour">
      <input ref={input.ref} type="color" className="atlas-swatch atlas-swatch--picker" value={color} onChange={input.onChange} />
    </LabelTooltip>
  );
}
