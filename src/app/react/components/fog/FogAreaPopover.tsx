import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { areaBadgeSpot, areaName, isFogArea, MAX_AREA_NAME } from '../../../fog/fogAreas';
import { t } from '../../../i18n';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { levelObjects } from '../../../levels/levelObjects';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { FOG_BADGE_RADIUS } from '../../../pixi/fog/fogAreaBadge';
import { useFocusWhileOpen } from '../../../pixi/lighting/LightPopover';
import { useMapPopoverPosition } from '../../../pixi/lighting/useLightPopoverPosition';
import { mapMarkerScale } from '../../../pixi/utils/mapMarkerScale';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';

/**
 * The popover a fog area is renamed in (store `fogAreaPopover`), beside the area's badge on the
 * map: one text field. Enter, or leaving the field, gives the area the name in one undo step;
 * Escape leaves the name as it was.
 */
export function FogAreaPopoverHost(): React.ReactElement {
  const areaId = useAtlasStore((state) => state.fogAreaPopover);
  // One popover for each area: a name typed for one never lands on another.
  return <AnimatePresence>{areaId && <FogAreaPopover key={areaId} areaId={areaId} />}</AnimatePresence>;
}

function FogAreaPopover({ areaId }: { areaId: string }): React.ReactElement {
  const store = useViewStoreHook();
  const id = useId();
  const stored = useAtlasStore((state) => {
    const area = levelObjects(state).fog[areaId];
    return isFogArea(area) ? areaName(area) ?? '' : '';
  });
  const [text, setText] = useState(stored);
  const ref = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Escape was pressed: leaving the field then keeps the name as it was. */
  const cancelled = useRef(false);
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useMapPopoverPosition(ref, areaId, (state, target, zoom) => {
    const area = levelObjects(state).fog[target];
    const spot = isFogArea(area) ? areaBadgeSpot(area) : null;
    return spot && { ...spot, bright: 0, dim: 0, marker: FOG_BADGE_RADIUS * mapMarkerScale(zoom) * zoom };
  });
  useFocusWhileOpen(ref, present);
  // The field is all there is: the popover opens ready to type over the name it has.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);

  const close = (): void => {
    if (store.getState().fogAreaPopover === areaId) store.getState().closeFogAreaPopover();
  };
  const commit = (): void => {
    if (!cancelled.current) store.getState().updateFogArea(areaId, { name: text });
    close();
  };

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover atlas-light-popover--fog-area"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label={t('fog.areaRename')}
      tabIndex={-1}
      inert={!present}
    >
      <label className="atlas-light-popover__range" htmlFor={id}>
        <span>{t('fog.areaName')}</span>
        <input
          ref={input}
          id={id}
          type="text"
          autoComplete="off"
          maxLength={MAX_AREA_NAME}
          value={text}
          placeholder={t('fog.areaNamePlaceholder')}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            // The field's keys are its own: none reaches the map's shortcuts.
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape' && !handledByAnotherControl(event.nativeEvent)) {
              event.preventDefault();
              cancelled.current = true;
              close();
            }
          }}
        />
      </label>
    </motion.section>
  );
}
