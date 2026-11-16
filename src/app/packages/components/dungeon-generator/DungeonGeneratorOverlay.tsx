import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../../react/ViewStoreContext';
import type { DungeonGeneratorRequest } from '../../../types/viewUIState';
import { t } from '../../../i18n';
import { dialogOverlayMotion } from '../primitives/dialogMotion';
import { DungeonWizard } from './DungeonWizard';
import { settleDungeonRequest } from './openDungeonGenerator';
import type { CreatedDungeonScene } from './useGeneratorActions';

/** The dungeon generator over the map while the view's store has it open. */
export function DungeonGeneratorOverlay(): React.JSX.Element {
  const request = useAtlasStore((s) => s.dungeonGenerator);
  const close = useAtlasStore((s) => s.closeDungeonGenerator);
  return (
    <AnimatePresence>
      {request && <GeneratorOverlay key={request.id} request={request} onClose={close} />}
    </AnimatePresence>
  );
}

interface OverlayProps {
  request: DungeonGeneratorRequest;
  onClose: (id: number) => void;
}

/**
 * A layer over the Atlas view (the leaf's `contain: strict` makes it the box of `position:
 * fixed`) holding the wizard. Escape and its X hand the pin back its dropdown; a press beside
 * it closes the dropdown too, as any press outside it does. The pin waiting for the scene gets it and
 * the map shows again. Closing while a scene is written waits for it.
 */
function GeneratorOverlay({ request, onClose }: OverlayProps): React.JSX.Element {
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const busy = useRef(false);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Closed under it (the view went, or the generator was opened anew): a pin still waiting hears
    // no scene came, unless one is being written, which still answers it once written.
    return () => { if (!busy.current) settleDungeonRequest(request.id, null); };
  }, [request.id]);

  const close = (): void => {
    if (busy.current) return;
    settleDungeonRequest(request.id, null);
    onClose(request.id);
  };

  // A scene finished after the GM opened the generator anew closes nothing: only its pin still gets it.
  const created = (scene: CreatedDungeonScene): void => {
    settleDungeonRequest(request.id, scene);
    if (store.getState().dungeonGenerator?.id === request.id) onClose(request.id);
  };

  return (
    <motion.div
      ref={setLayer}
      className="atlas-dungeon-generator-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('dungeon.title')}
      {...dialogOverlayMotion}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
        event.preventDefault();
        close();
      }}
    >
      <div className="atlas-dungeon-generator-overlay__backdrop" onPointerDown={close} />
      {layer && (
        <DungeonWizard
          app={app}
          layer={layer}
          collectionId={request.collectionId}
          initialName={request.name}
          anchor={request.anchor}
          onCreated={created}
          onBusyChange={(now) => { busy.current = now; }}
          onClose={close}
        />
      )}
    </motion.div>
  );
}
