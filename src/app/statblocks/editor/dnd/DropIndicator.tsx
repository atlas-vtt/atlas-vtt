import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { boxIn } from '../template-editor/canvasGaps';
import { boxStyle } from '../template-editor/ChromeLayer';
import { blockFrame } from '../template-editor/editorChrome';
import { lineBox, type Box, type DropLine } from './dropGeometry';
import type { DropView } from './dropView';
import { t } from '../../../i18n';

/** How long the wash over a block that just landed takes to fade (§7.6). */
const LANDED_MS = 600;

function Line({ line }: { line: DropLine }): React.JSX.Element {
  return <div className="atlas-te-drop-line" data-orientation={line.orientation} style={boxStyle(lineBox(line))} />;
}

function ViewOf({ view }: { view: DropView }): React.JSX.Element | null {
  switch (view.kind) {
    case 'line': return <Line line={view.line} />;
    case 'into': return <div className="atlas-te-drop-into" style={boxStyle(view.outline)}><span className="atlas-te-drop-into__text">{t('statblockEditor.dropHere')}</span></div>;
    case 'refused': return null;
  }
}

/** The accent wash over a block that just landed, fading out; it shows where a moved block went. */
function LandedWash({ stage, id, onDone }: { stage: HTMLElement; id: string; onDone: () => void }): React.JSX.Element | null {
  const reduced = useReducedMotion() === true;
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const frame = blockFrame(stage, id);
    if (frame) setBox(boxIn(stage, frame));
    else onDone();
  }, [stage, id, onDone]);
  if (!box) return null;
  return (
    <div className="atlas-te-drop-landed" style={boxStyle(box)}>
      <motion.div
        className="atlas-te-drop-landed__fill"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: (reduced ? LANDED_MS / 2 : LANDED_MS) / 1000 }}
        onAnimationComplete={onDone}
      />
    </div>
  );
}

export interface DropIndicatorProps {
  stage: HTMLElement | null;
  /** What the drag over the canvas shows now; null while nothing is held over it. */
  view: DropView | null;
  /** The block that just landed, counted so that landing twice in one place washes twice. */
  landed: { id: string; count: number } | null;
  onLanded: () => void;
}

/**
 * The drop line, the empty container a drop goes into, and the wash where
 * it landed. Drawn in the stage over the
 * card, in the gutter between blocks; never in the card's own flow.
 */
export function DropIndicator({ stage, view, landed, onLanded }: DropIndicatorProps): React.JSX.Element | null {
  if (!stage || (!view && !landed)) return null;
  return createPortal(
    <div className="atlas-te-drop-layer" aria-hidden="true">
      {view && <ViewOf view={view} />}
      {landed && <LandedWash key={landed.count} stage={stage} id={landed.id} onDone={onLanded} />}
    </div>,
    stage,
  );
}
