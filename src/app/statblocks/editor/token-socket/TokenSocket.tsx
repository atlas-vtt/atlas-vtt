import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import type { ImageBlock } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import { usePaneEdit } from '../statblock-pane/paneEditContext';
import { TokenLinkPanel } from './TokenLinkPanel';
import { TokenSocketFace } from './TokenSocketFace';
import { shownArt } from './tokenSocketActions';
import { useSocketDismiss } from './useSocketDismiss';
import { useSocketPlacement } from './useSocketPlacement';
import './token-socket.scss';

export interface TokenSocketProps {
  block: ImageBlock;
  /** The art as the card draws it; shown inside the socket while the note names an image the vault holds. */
  art: React.ReactNode;
}

/**
 * The Image block in the statblock beside its note: a button around the art
 * (or an empty socket) that opens the panel where tokens are linked to the
 * statblock and its art is chosen. The runtime card has no socket.
 */
export function TokenSocket({ block, art }: TokenSocketProps): React.JSX.Element {
  const pane = usePaneEdit();
  const field = pane.sheet.fields.get(block.field);
  const [socket, setSocket] = useState<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // A token's ring changes outside the note: the socket draws the art again when the asset index says so.
  const [, assetsChanged] = useReducer((count: number): number => count + 1, 0);
  useEffect(() => {
    const ref = pane.app.workspace.on('atlas-vtt:refresh-assets', assetsChanged);
    return () => pane.app.workspace.offref(ref);
  }, [pane.app]);
  const variants = useAnchoredPopoverVariants();
  const placement = useSocketPlacement(socket, open);
  const keepInView = useKeepInView(popoverRef, open && placement !== null, placement?.above ? 'top' : 'bottom', placement?.key);

  const close = useCallback((refocus: boolean): void => {
    setOpen(false);
    if (refocus) socket?.focus({ preventScroll: true });
  }, [socket]);

  const placed = placement !== null;
  useEffect(() => {
    if (open && placed) searchRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  useSocketDismiss(pane.app, open, socket, popoverRef, close);

  if (!field || !pane.writable) return <>{art}</>;
  const { src, token } = shownArt(pane, field);
  const named = valueText(pane.read(field).value) !== '';
  // A portrait is the card's own drawing, which shows a linked token's art too where the note's cannot be shown.
  const shown = block.shape === 'token' && src
    ? <TokenPortrait className="atlas-sb-token-image" src={src} alt="" showRing={token?.showRing !== false} />
    : art;

  return (
    <>
      <LabelTooltip label="Link token art">
        <TokenSocketFace
          ref={setSocket}
          shape={block.shape}
          art={src ? shown : null}
          prompt={named ? 'Art not found' : 'Add token art'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        />
      </LabelTooltip>
      {socket && createPortal(
        <AnimatePresence>
          {open && placement && (
            <div
              key="token-panel"
              ref={popoverRef}
              className="atlas-vtt-plugin atlas-sb-token-popover"
              data-above={placement.above || undefined}
              style={{ ...placement.style, ...keepInView.style }}
            >
              <motion.div className="atlas-sb-token-popover__motion" variants={variants} initial="hidden" animate="visible" exit="exit">
                <TokenLinkPanel pane={pane} field={field} collectionId={pane.collectionId} onClose={close} searchRef={searchRef} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        socket.doc.body,
      )}
    </>
  );
}
