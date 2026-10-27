import { readLight } from '../../lighting/lightingObjects';
import React, { useEffect, useId, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Lightbulb, LightbulbOff, Trash2 } from 'lucide-react';
import { unitLabelFor } from '../../grid/measurementFormat';
import { handledByAnotherControl } from '../../keyboard/tooltipEscape';
import { LIGHT_SCHEDULES, scheduleOf } from '../../lighting/lightActivity';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { maxLightRange } from '../../lighting/lightRanges';
import { Button } from '../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../packages/components/primitives/dialogMotion';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import { rulesLookup } from '../../services/mapRules';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { Select } from '../../packages/components/primitives/Select';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { useMapLightPresets } from '../../react/hooks/useMapLightPresets';
import { LightEmissionFields } from './LightEmissionFields';
import { useGestureTransactions } from './useGestureTransactions';
import { useLightPopoverPosition } from './useLightPopoverPosition';
import { levelObjects } from '../../levels/levelObjects';

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts (Tab, Space, arrows). */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * The popover of the light the GM edits (store `lightPopover`), beside its marker on the map.
 * One popover: opening another light moves it there. The canvas draws that light's range rings
 * from the same store field (`LightRangeRings`).
 */
export function LightPopoverHost(): React.ReactElement {
  const lightId = useAtlasStore((state) => state.lightPopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{lightId && <LightPopover key="light-popover" lightId={lightId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LightPopover({ lightId }: { lightId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const { app } = useAtlasUI();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const unitType = useAtlasStore((state) => mapMeasurementSettings(rules, state).unitType);
  const unitDistance = useAtlasStore((state) => mapMeasurementSettings(rules, state).unitDistance);
  const maxRange = useAtlasStore((state) => maxLightRange(unitScaleOf({ unitDistance }, state.grid)));
  const current = useAtlasStore((state) => readLight(levelObjects(state).lights[lightId]));
  // While it leaves, the popover still shows the light it had, also when that light was deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const light = shown.current;
  const presets = useMapLightPresets();
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  const makeWay = useLightPopoverPosition(ref, lightId, unitDistance);
  useFocusWhileOpen(ref, present);

  const { onSliderPointerDown, beginPick, endPick } = useGestureTransactions(store);

  if (!light) return null;
  const emission = light.emission;
  const update = (next: LightEmission): void => {
    if (next !== emission) store.getState().updateLight(light.id, { emission: next });
  };
  const close = (): void => store.getState().closeLightPopover();

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label="Light"
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          // A list inside (the flicker select, the menu of more lights) closed itself with this key.
          if (!handledByAnotherControl(event.nativeEvent)) close();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <LightEmissionFields
        emission={emission}
        onChange={update}
        presets={presets}
        unit={unitLabelFor(unitType)}
        unitDistance={unitDistance}
        maxRange={maxRange}
        surface={!!light.area}
        more={<ShinesRow light={light} onChange={(activeBelowAmbient) => store.getState().updateLight(light.id, { activeBelowAmbient })} />}
        onBeamCommit={makeWay}
        direction={{ degrees: light.rotation ?? 0, onChange: (rotation) => store.getState().updateLight(light.id, { rotation }) }}
        onSliderPointerDown={onSliderPointerDown}
        onPickStart={beginPick}
        onPickEnd={endPick}
      />
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <Button variant="ghost" size="sm" onClick={() => store.getState().updateLight(light.id, { hidden: !light.hidden })}>
          {light.hidden ? <Lightbulb /> : <LightbulbOff />}
          <span>{light.hidden ? 'Turn on' : 'Turn off'}</span>
        </Button>
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLight(light.id)}>
          <Trash2 />
          <span>Delete</span>
        </Button>
      </div>
    </motion.section>
  );
}

/** When a placed light shines: always, or only from a time of day on, like a street lamp. */
function ShinesRow({ light, onChange }: { light: LightSource; onChange: (level: number | undefined) => void }): React.ReactElement {
  const id = useId();
  const current = scheduleOf(light);
  // A level that is no time of day is offered only while the light has it.
  const options = current.value === 'custom' ? [...LIGHT_SCHEDULES, current] : LIGHT_SCHEDULES;
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>Shines</span>
      <Select value={current.value} options={options} labelledBy={id}
        onChange={(value) => {
          const stop = LIGHT_SCHEDULES.find((schedule) => schedule.value === value);
          if (stop) onChange(stop.level);
        }} />
    </div>
  );
}

/**
 * Focus moves into the popover when it opens (to the popover itself, so Tab reaches its first
 * control and no tooltip opens unasked), and back to where it was when the popover starts to leave.
 */
function useFocusWhileOpen(ref: React.RefObject<HTMLElement | null>, present: boolean): void {
  const before = useRef<Element | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (present) {
      before.current = element.ownerDocument.activeElement;
      element.focus({ preventScroll: true });
    } else if (before.current?.instanceOf(HTMLElement) && before.current.isConnected) {
      // `instanceOf`: in a popout window the element belongs to that window's classes.
      before.current.focus({ preventScroll: true });
    }
  }, [ref, present]);
}
