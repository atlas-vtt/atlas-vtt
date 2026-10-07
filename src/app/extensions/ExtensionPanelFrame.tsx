import React, { useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { GripHorizontal } from 'lucide-react';
import type { PanelSpec, ViewContext } from '../../api/types/ui';
import { CloseButton } from '../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../packages/components/primitives/dialogMotion';
import { useDraggablePosition } from '../react/hooks/useDraggablePosition';
import { useExtensionMount } from './useExtensionMount';
import { t } from '../i18n';

const DRAG_MARGIN = 12; // as the stack's inset

interface ExtensionPanelFrameProps {
  owner: string;
  panel: PanelSpec;
  ctx: ViewContext;
  onClose: () => void;
}

/**
 * Atlas's panel around what an extension renders: the panel corner, a header with the title and `CloseButton`,
 * and the dialogs' motion. The header moves it: until then it keeps its place in the stack, after that it is
 * placed within the view (the stack covers it) for as long as the panel stays open. The extension mounts into the body when the panel opens and its disposer runs as soon
 * as the panel starts to close (not after the exit motion), when the view unmounts, or when the panel is disposed.
 */
export function ExtensionPanelFrame({ owner, panel, ctx, onClose }: ExtensionPanelFrameProps): React.ReactElement | null {
  const variants = useDialogWindowVariants();
  const present = useIsPresent();
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(
    { x: DRAG_MARGIN, y: DRAG_MARGIN },
    { margin: DRAG_MARGIN, measureStart: (panel) => (panel.offsetParent ? { x: panel.offsetLeft, y: panel.offsetTop } : null) },
  );
  // The context is read when the panel opens; a later render must not mount it again.
  const body = useExtensionMount({
    owner, what: `panel "${panel.id}"`, spec: panel, ctx, remountKey: '', active: present,
    onFailed: () => { setFailed(true); onClose(); },
  });

  if (failed) return null;
  return (
    <motion.section
      ref={panelRef}
      className={`atlas-extension-panel${moved ? ' is-moved' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={moved ? { left: position.x, top: position.y } : {}}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={panel.title}
    >
      <header
        className="atlas-extension-panel__header"
        onPointerDown={(event) => {
          // A press on the close button is not a drag: the panel stays where it is until the header is pressed.
          if (event.button === 0 && !(event.target instanceof Element && event.target.closest('button'))) setMoved(true);
          startDrag(event);
        }}
      >
        <GripHorizontal className="atlas-extension-panel__grip" />
        <h2 className="atlas-extension-panel__title">{panel.title}</h2>
        <CloseButton onClick={onClose} aria-label={t('extensions.closePanel', { name: panel.title })} />
      </header>
      <div ref={body} className="atlas-extension-panel__body" />
    </motion.section>
  );
}
