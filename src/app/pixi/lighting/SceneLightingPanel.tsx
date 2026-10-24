import React, { useState } from 'react';
import type { App } from 'obsidian';
import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal, SlidersHorizontal } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { useAtlasStore } from '../../react/ViewStoreContext';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../react/hooks/useDraggablePosition';
import {
  DEFAULT_EXPLORED_COLOR,
  DEFAULT_UNEXPLORED_COLOR,
  darkSightLookOf,
  darkSightTintOf,
  exploredMemoryOn,
  litThresholdOf,
  sightOnDropOn,
  tokenVisionOn,
  unexploredImageOf,
  unexploredSoftnessOf,
  MAX_UNEXPLORED_SOFTNESS,
} from '../../lighting/sceneLightingOptions';
import type { DarkSightLook } from '../../types/lightingTypes';
import type { SegmentedOption } from '../../packages/components/primitives/SegmentedControl';
import { ChoiceField, ColorField, ImageField, SliderField, TintField, ToggleField } from './lightingPanelFields';
import { pickUnexploredImage } from './UnexploredImageModal';
import { t } from '../../i18n';

const MARGIN = 16;

const DARK_SIGHT_LOOK_OPTIONS: readonly SegmentedOption<DarkSightLook>[] = [
  { value: 'system', label: 'As the system says' },
  { value: 'grey', label: 'Grey' },
  { value: 'colour', label: 'In colour' },
];

/** First placement: the top right of the map, below the scene tabs, like the other map windows. */
const topRight = (area: PanelArea, panel: PanelArea): PanelPosition => ({ x: area.width - panel.width - MARGIN, y: 64 });

/**
 * The scene lighting settings panel, while it is open. `UIRoot` mounts it outside the toolbar's
 * tooltip provider, and its switches' tooltips need one. `app` is the vault the fog map is picked from.
 */
export function SceneLightingPanelHost({ app }: { app: App }): React.ReactElement {
  const open = useAtlasStore((state) => state.isSceneLightingPanelOpen);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{open && <SceneLightingPanel key="scene-lighting" app={app} />}</AnimatePresence>
    </TooltipProvider>
  );
}

/** How the scene's lighting treats sight and memory. Changes apply at once and are never undo steps. */
function SceneLightingPanel({ app }: { app: App }): React.ReactElement {
  const lighting = useAtlasStore((state) => state.lighting);
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting);
  const setOpen = useAtlasStore((state) => state.setSceneLightingPanelOpen);
  const windowVariants = useDialogWindowVariants();
  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(topRight, { margin: MARGIN });
  // The value shows live while dragging and reaches the scene on release: every step would
  // rebuild sight and record explored memory, and a pass below the ambient level would record
  // everything in sight for good.
  const [dragged, setDragged] = useState<number | null>(null);
  const threshold = dragged ?? Math.round(litThresholdOf(lighting) * 100);
  const [draggedSoftness, setDraggedSoftness] = useState<number | null>(null);
  const softness = draggedSoftness ?? unexploredSoftnessOf(lighting);

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-light-panel${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={t('sceneLight.settings')}
    >
      <header className="atlas-light-panel__header" onPointerDown={startDrag}>
        <GripHorizontal className="atlas-light-panel__grip" />
        <SlidersHorizontal className="atlas-light-panel__icon" />
        <h2 className="atlas-light-panel__title">{t('sceneLight.settings')}</h2>
        <CloseButton onClick={() => setOpen(false)} aria-label={t('sceneLight.closeSettings')} />
      </header>
      <div className="atlas-light-panel__body">
        <ToggleField
          label={t('sceneLight.tokenVision')}
          value={tokenVisionOn(lighting)}
          tooltipOn={t('sceneLight.tokenVisionOn')}
          tooltipOff={t('sceneLight.tokenVisionOff')}
          onChange={(tokenVision) => setSceneLighting({ tokenVision })}
        />
        <ToggleField
          label={t('sceneLight.memory')}
          value={exploredMemoryOn(lighting)}
          tooltipOn={t('sceneLight.memoryOn')}
          tooltipOff={t('sceneLight.memoryOff')}
          onChange={(exploredMemory) => setSceneLighting({ exploredMemory })}
        />
        <ToggleField
          label="Update sight when a token is dropped"
          value={sightOnDropOn(lighting)}
          tooltipOn="Dragging a token shows the players nothing new until you drop it"
          tooltipOff="Sight and light follow a token while you drag it"
          // Off is the default and is stored as no choice at all.
          onChange={(on) => setSceneLighting({ sightOnDrop: on ? true : undefined })}
        />
        <div className="atlas-light-panel__row atlas-light-panel__row--pair">
          <ColorField label={t('sceneLight.exploredColour')} value={lighting.exploredColor ?? DEFAULT_EXPLORED_COLOR}
            onChange={(exploredColor) => setSceneLighting({ exploredColor })} />
          <ColorField label={t('sceneLight.unexploredColour')} value={lighting.unexploredColor ?? DEFAULT_UNEXPLORED_COLOR}
            onChange={(unexploredColor) => setSceneLighting({ unexploredColor })} />
        </div>
        {/* A fog map over never-seen areas in place of the colour, which shows where it is transparent. No image is stored as unset. */}
        <ImageField label={t('sceneLight.unexploredImage')} value={unexploredImageOf(lighting)}
          chooseLabel={t('sceneLight.unexploredImageChoose')} clearLabel={t('sceneLight.unexploredImageClear')}
          onChoose={() => pickUnexploredImage(app, (unexploredImage) => setSceneLighting({ unexploredImage }))}
          onClear={() => setSceneLighting({ unexploredImage: undefined })} />
        {/* Shown while there is no fog map too, disabled, so the panel keeps its shape. Set on release: each step redraws the composite only, but stays one change. */}
        <SliderField label={t('sceneLight.unexploredSoftness')} value={softness} min={0} max={MAX_UNEXPLORED_SOFTNESS} step={0.5}
          display={t('sceneLight.unexploredSoftnessCells', { count: softness })} disabled={unexploredImageOf(lighting) === null}
          onChange={setDraggedSoftness}
          onCommit={(cells) => {
            setDraggedSoftness(null);
            setSceneLighting({ unexploredSoftness: cells });
          }} />
        <SliderField label={t('sceneLight.litFrom')} value={threshold} min={0} max={100} step={1} display={`${threshold} %`}
          onChange={setDragged}
          onCommit={(percent) => {
            setDragged(null);
            setSceneLighting({ litThreshold: percent / 100 });
          }} />
        {/* Only the picture of what senses without colour show; the system's look and no tint are stored as unset. */}
        <ChoiceField label="Darkvision looks" value={darkSightLookOf(lighting)} options={DARK_SIGHT_LOOK_OPTIONS}
          onChange={(look) => setSceneLighting({ darkSightLook: look === 'system' ? undefined : look })} />
        <TintField label="Darkvision tint" value={darkSightTintOf(lighting)} clearLabel="No tint"
          onChange={(tint) => setSceneLighting({ darkSightTint: tint ?? undefined })} />
      </div>
    </motion.section>
  );
}
