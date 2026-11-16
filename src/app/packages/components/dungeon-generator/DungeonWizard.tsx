import React, { useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { App } from 'obsidian';
import { useElementHeight } from '../../../react/hooks/useElementHeight';
import { ContextMenuProvider } from '../../../react/root/ContextMenuContext';
import { observeResize } from '../../../utils/observeResize';
import { useAnchoredPopoverVariants } from '../primitives/dialogMotion';
import type { CreatedDungeonScene } from './useGeneratorActions';
import { useWizard } from './useWizard';
import { WizardPanel } from './WizardPanel';
import { WizardPreview } from './WizardPreview';
import { wizardLayout, type Box } from './wizardLayout';

/** The panel's width; the pin dropdown it takes over is about as wide. */
export const WIZARD_PANEL_WIDTH = 360;

export interface DungeonWizardProps {
  app: App;
  /** What the wizard stands in: the Atlas view's box, whose size and place it measures. */
  layer: HTMLElement;
  collectionId: string;
  /** The name typed where the wizard was opened from: the scene's name to begin with. */
  initialName?: string | undefined;
  /** The note pin dropdown the wizard takes over, in the window's pixels; unset centres it. */
  anchor?: Box | undefined;
  onCreated: (scene: CreatedDungeonScene) => void;
  /** A scene is being created: whoever holds the wizard waits for it before letting go. */
  onBusyChange?: ((busy: boolean) => void) | undefined;
  onClose: () => void;
}

/** The layer's size, and its corner in the window. */
function useLayerBox(layer: HTMLElement): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const measure = (): void => {
      const { left, top, width, height } = layer.getBoundingClientRect();
      setBox((old) => (old && old.left === left && old.top === top && old.width === width && old.height === height ? old : { left, top, width, height }));
    };
    measure();
    return observeResize([layer], measure);
  }, [layer]);
  return box;
}

/**
 * The dungeon generator as a wizard: a compact panel that asks one thing a step (theme, layout,
 * features, style, name) and the live map floating beside it in a card of its own, which every
 * answer redraws at once. Opened from a note pin it stands where the pin's dropdown stood.
 */
export function DungeonWizard(props: DungeonWizardProps): React.JSX.Element {
  return (
    <ContextMenuProvider local>
      <Wizard {...props} />
    </ContextMenuProvider>
  );
}

function Wizard({ app, layer, collectionId, initialName, anchor, onCreated, onBusyChange, onClose }: DungeonWizardProps): React.JSX.Element {
  const wizard = useWizard({ app, collectionId, initialName, onCreated, onBusyChange });
  const [panelRef, panelHeight] = useElementHeight<HTMLDivElement>();
  const view = useLayerBox(layer);
  const { setPanel } = wizard;

  const local = view && anchor ? { ...anchor, left: anchor.left - view.left, top: anchor.top - view.top } : null;
  const layout = view && panelHeight !== null ? wizardLayout(view, { width: WIZARD_PANEL_WIDTH, height: panelHeight }, local) : null;
  const laidOut = layout !== null;
  // Hidden until laid out, and a hidden panel takes no focus.
  useEffect(() => { if (laidOut) setPanel(panelRef.current); }, [laidOut, panelRef, setPanel]);
  const panelBox = layout?.panel ?? { left: 0, top: 0 };
  // The panel grows out of the dropdown it replaces, or out of its own middle.
  const origin = local && layout
    ? `${local.left + local.width / 2 - layout.panel.left}px ${local.top + local.height / 2 - layout.panel.top}px`
    : 'center';
  const panelVariants = useAnchoredPopoverVariants();

  return (
    <>
      <motion.div
        ref={panelRef}
        className="atlas-dungeon-wizard"
        role="group"
        aria-labelledby={wizard.titleId}
        style={{ ...panelBox, width: WIZARD_PANEL_WIDTH, transformOrigin: origin, visibility: layout ? 'visible' : 'hidden' }}
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        inert={wizard.actions.creating}
      >
        <WizardPanel wizard={wizard} onClose={onClose} />
      </motion.div>
      <AnimatePresence>
        {layout && (
          <WizardPreview
            key="preview"
            box={layout.preview}
            side={layout.preview.left < layout.panel.left ? -1 : 1}
            wizard={wizard}
          />
        )}
      </AnimatePresence>
    </>
  );
}
