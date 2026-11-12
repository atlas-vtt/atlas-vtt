import React, { useId, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import type { KeptMeasure, MeasureChanges, MeasureShapeKind } from '../../../measure/measureTypes';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { DropdownSwatchGrid } from '../../../packages/components/primitives/DropdownSwatchGrid';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { MEASURE_COLOR_SWATCHES, measureColorOfSwatch, swatchOfMeasureColor } from '../../../packages/components/toolbar/measureToolChoices';
import { useFocusWhileOpen } from '../../../pixi/lighting/LightPopover';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import { pathDistance } from '../../../pixi/measure/measureDistances';
import { MEASURE_HANDLE_RADIUS, measureHandlePoint } from '../../../pixi/measure/measureHandle';
import { keptMeasure } from '../../../pixi/measure/measurePopoverGuard';
import { mapMarkerScale } from '../../../pixi/utils/mapMarkerScale';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';

/**
 * Keys the popover's controls use themselves; they must not reach the map's shortcuts (Tab, Space,
 * arrows). Delete and Backspace are left to the map, which deletes the measurement with them.
 */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

const SHAPE_NAMES: Record<MeasureShapeKind, string> = {
  ruler: t('measure.shape.ruler'),
  circle: t('measure.shape.circle'),
  cone: t('measure.shape.cone'),
  square: t('measure.shape.square'),
  line: t('measure.shape.line'),
};

/**
 * The popover of the kept measurement the GM edits (store `measurePopover`), beside its handle on
 * the map. One popover: opening another measurement moves it there.
 */
export function MeasurePopoverHost(): React.ReactElement {
  const measureId = useAtlasStore((state) => state.measurePopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{measureId && <MeasurePopover key="measure-popover" measureId={measureId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

/**
 * What it holds, top to bottom: what the measurement is and measures, its colour, its switches
 * and, last, what is done with it. Every control writes to the store at once, one undo step each.
 */
function MeasurePopover({ measureId }: { measureId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const current = useAtlasStore((state) => keptMeasure(state, measureId));
  // While it leaves, the popover still shows the measurement it had, also when that was deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const measure = shown.current;
  const ref = useRef<HTMLElement>(null);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, measureId, (state, id, zoom) => {
    const target = keptMeasure(state, id);
    return target ? { ...measureHandlePoint(target), bright: 0, dim: 0, marker: MEASURE_HANDLE_RADIUS * mapMarkerScale(zoom) * zoom } : null;
  });
  useFocusWhileOpen(ref, present);

  if (!measure) return null;
  const update = (changes: MeasureChanges): void => store.getState().updateMeasure(measure.id, changes);
  const remove = (): void => store.getState().deleteMeasure(measure.id);

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-measure-popover"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={t('measure.popover')}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          // A tooltip that closed on this key is no control that used it.
          if (handledByAnotherControl(event.nativeEvent)) return;
          event.preventDefault();
          store.getState().closeMeasurePopover();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <MeasureHeading measure={measure} />
      <DropdownSwatchGrid
        label={t('toolbar.colour')}
        swatches={MEASURE_COLOR_SWATCHES}
        value={swatchOfMeasureColor(measure.color)}
        onChange={(swatch) => update({ color: measureColorOfSwatch(swatch) ?? undefined })}
      />
      <div className="atlas-light-popover__section">
        <SwitchRow label={t('toolbar.measurePlayers')} value={measure.hidden !== true} onChange={(players) => update({ hidden: players ? undefined : true })} />
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <span />
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={remove}>
          <Trash2 />
          <span>{t('common.delete')}</span>
        </Button>
      </div>
    </motion.section>
  );
}

/** What the measurement is and what it measures, as its label on the map says it: "Ruler · 35 ft". */
function MeasureHeading({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const { app } = useAtlasUI();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const value = useAtlasStore((state) => (state.grid ? pathDistance(state.grid, measure.points, mapMeasurementSettings(rules, state)) : ''));
  const shape = SHAPE_NAMES[measure.shape];
  return <span className="atlas-light-popover__heading">{value ? t('measure.heading', { shape, value }) : shape}</span>;
}

/** One switch of the measurement, named by the text before it. */
function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{label}</span>
      <ToggleSwitch size="s" value={value} labelledBy={id} onChange={() => onChange(!value)} />
    </div>
  );
}
