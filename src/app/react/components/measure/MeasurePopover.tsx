import React, { useId, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { MousePointerClick, Trash2 } from 'lucide-react';
import { formatDistance, rangeBandName } from '../../../grid/measurementFormat';
import { t } from '../../../i18n';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { levelObjects } from '../../../levels/levelObjects';
import { auraBadgePoint, auraCells } from '../../../measure/auraArea';
import { isAura } from '../../../measure/keptMeasures';
import { lengthInCells } from '../../../measure/measureGrid';
import { auraLabelText } from '../../../measure/measureLabelText';
import { MAX_LINE_WIDTH, type KeptMeasure, type MeasureChanges, type MeasureShapeKind } from '../../../measure/measureTypes';
import { Stepper } from '../../../packages/components/dungeon-generator/fields';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { DropdownSwatchGrid } from '../../../packages/components/primitives/DropdownSwatchGrid';
import { LabelTooltip, TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { MEASURE_COLOR_SWATCHES, measureColorOfSwatch, swatchOfMeasureColor } from '../../../packages/components/toolbar/measureToolChoices';
import { useFocusWhileOpen } from '../../../pixi/lighting/LightPopover';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import { measureDistance } from '../../../pixi/measure/measureDistances';
import { MEASURE_HANDLE_RADIUS, measureHandlePoint } from '../../../pixi/measure/measureHandle';
import { keptMeasure } from '../../../pixi/measure/measurePopoverGuard';
import { measureHeightAt } from '../../../pixi/measureTokenHeights';
import { mapMarkerScale } from '../../../pixi/utils/mapMarkerScale';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import { mapTokens } from '../../../tokens/offMap';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { FollowsToken } from './FollowsToken';
import { SwitchRow } from './SwitchRow';

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
 * (an area's also whether walls stop it, a circle's whether it follows the token it lies on, and a
 * line's width) and, last, what is done with it: an area's tokens selected, and the measurement
 * deleted. An aura's stands beside its badge on its token's rim. Every control writes to the store at once,
 * one undo step each.
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
    if (!target) return null;
    const token = isAura(target) ? mapTokens(levelObjects(state))[target.follows] : undefined;
    const at = token && state.grid ? auraBadgePoint(token, state.grid) : measureHandlePoint(target);
    return { ...at, bright: 0, dim: 0, marker: MEASURE_HANDLE_RADIUS * mapMarkerScale(zoom) * zoom };
  });
  useFocusWhileOpen(ref, present);

  if (!measure) return null;
  const update = (changes: MeasureChanges): void => store.getState().updateMeasure(measure.id, changes);
  const remove = (): void => store.getState().deleteMeasure(measure.id);
  const area = measure.shape !== 'ruler';

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
        {area && <SwitchRow label={t('measure.stopsAtWalls')} value={measure.walls !== false} onChange={(stops) => update({ walls: stops ? undefined : false })} />}
        {measure.shape === 'circle' && <FollowsToken measure={measure} />}
        {measure.shape === 'line' && <LineWidth measure={measure} />}
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        {area ? <SelectTokens measure={measure} /> : <span />}
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
  const store = useViewStoreHook();
  const value = useAtlasStore((state) => {
    const { grid } = state;
    if (!grid) return '';
    const settings = mapMeasurementSettings(rules, state);
    if (isAura(measure)) return auraLabelText(auraCells(measure.aura, settings.unitDistance), settings);
    // The label's own words: a ruler's with the height between the tokens under its ends.
    return measureDistance(grid, measure, settings, measureHeightAt(store, { getOptions: () => grid }));
  });
  const shape = isAura(measure) ? t('measure.shape.aura') : SHAPE_NAMES[measure.shape];
  return <span className="atlas-light-popover__heading">{value ? t('measure.heading', { shape, value }) : shape}</span>;
}

/** How wide a line is, in whole cells, written as the map writes a distance. The tool makes its next line as wide. */
function LineWidth({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const id = useId();
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const size = useAtlasStore((state) => state.grid?.size ?? 0);
  const cells = size > 0 ? Math.min(MAX_LINE_WIDTH, Math.max(1, Math.round(lengthInCells(measure.width ?? size, size)))) : 1;
  const text = useAtlasStore((state) => {
    const settings = mapMeasurementSettings(rules, state);
    // A range band names how far something is; a width has none, and is said in squares, as a distance no band names is.
    return settings.mode === 'abstract' ? rangeBandName(cells, []) : formatDistance(cells, settings);
  });
  const change = (next: number): void => {
    store.getState().updateMeasure(measure.id, { width: next * size });
    store.getState().setMeasureTool({ lineWidth: next });
  };
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{t('measure.width')}</span>
      <Stepper labelledBy={id} value={cells} min={1} max={MAX_LINE_WIDTH} onChange={change} fewer={t('measure.narrower')} more={t('measure.wider')} disabled={size <= 0} text={text} />
    </div>
  );
}

/** Selects the tokens in the area, the ones it rings while its popover is open, and closes the popover. */
function SelectTokens({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const { renderer } = useAtlasUI();
  const store = useViewStoreHook();
  // Asked again with every change of the scene: the tokens, the walls and the area itself decide.
  const count = useAtlasStore(() => renderer?.tokensInMeasure(measure.id).length ?? 0);
  const select = (): void => {
    const ids = renderer?.tokensInMeasure(measure.id) ?? [];
    store.getState().setSelection([...ids]);
    store.getState().closeMeasurePopover();
  };
  const button = (
    <Button variant="ghost" size="sm" disabled={count === 0} onClick={select}>
      <MousePointerClick />
      <span>{t('measure.selectTokens')}</span>
    </Button>
  );
  // A disabled button takes no pointer: the span around it holds the tooltip that says why.
  return count === 0 ? <LabelTooltip label={t('measure.noTokens')} describe><span>{button}</span></LabelTooltip> : button;
}
