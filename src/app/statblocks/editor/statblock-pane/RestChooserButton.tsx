import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';
import { checkRest, type RestOffer, type RestRequest } from '../../../recovery/restOffer';
import type { RestChoices } from '../../../recovery/restTypes';
import type { AllyRests } from '../../../recovery/restWrites';
import { useSocketDismiss } from '../token-socket/useSocketDismiss';
import { useSocketPlacement } from '../token-socket/useSocketPlacement';
import { paneAllies, type PaneAllies } from './paneAllies';
import { restOfferNow, type PaneRestContext } from './paneRest';
import { RestChooserPanel } from './RestChooserPanel';

interface RestChooserButtonProps {
  button: RecoveryButton;
  context: PaneRestContext;
  disabled: boolean;
  busy: boolean;
  /** Takes the rest the panel settled on. */
  onRest: (buttonId: string, choices: RestChoices, allies: AllyRests) => Promise<void>;
  children: React.ReactNode;
}

/** What the panel shows: the button as the character can take it now, and whom an action may be taken for. */
interface Opened {
  readonly offer: RestOffer;
  readonly allies: PaneAllies;
}

/**
 * A recovery button with steps: a press opens the rest chooser under it, read from the character
 * as it is then. Rest checks the choice once more against the character as it is at that moment;
 * where it no longer fits (a value changed meanwhile), the panel shows the fresh offer instead.
 */
export function RestChooserButton({ button, context, disabled, busy, onRest, children }: RestChooserButtonProps): React.JSX.Element {
  const { pane, recovery } = context;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const open = opened !== null;
  const variants = useAnchoredPopoverVariants();
  const placement = useSocketPlacement(anchor, open, 'start');
  const keepInView = useKeepInView(popoverRef, open && placement !== null, placement?.above ? 'top' : 'bottom', placement?.key);

  const close = useCallback((refocus: boolean): void => {
    setOpened(null);
    if (refocus) anchor?.focus({ preventScroll: true });
  }, [anchor]);
  useSocketDismiss(pane.app, open, anchor, popoverRef, close);

  const toggle = (): void => {
    if (open) return close(false);
    const offer = restOfferNow(pane, recovery, button);
    if (offer) setOpened({ offer, allies: paneAllies(pane.app, recovery.character) });
  };

  const rest = (request: RestRequest): void => {
    if (!opened) return;
    const fresh = restOfferNow(pane, recovery, button);
    if (!fresh) return;
    const checked = checkRest([fresh], request, opened.allies.ids);
    if (!checked) {
      setOpened({ ...opened, offer: fresh });
      return;
    }
    close(true);
    void onRest(button.id, checked.choices, opened.allies.rests);
  };

  const keepLayer = (element: HTMLDivElement | null): void => {
    popoverRef.current = element;
    setLayer(element);
  };

  return (
    <>
      <button ref={setAnchor} type="button" className="atlas-sb-recovery__button" disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} data-state={open ? 'open' : 'closed'} onClick={toggle}>
        {children}
      </button>
      {anchor && createPortal(
        <AnimatePresence>
          {opened && placement && (
            <div key="rest-chooser" ref={keepLayer} className="atlas-vtt-plugin atlas-sb-rest-popover"
              data-above={placement.above || undefined} style={{ ...placement.style, ...keepInView.style }}>
              <motion.div className="atlas-sb-rest-popover__motion" variants={variants} initial="hidden" animate="visible" exit="exit">
                <RestChooserPanel offer={opened.offer} selfName={recovery.character.name} allies={opened.allies} busy={busy}
                  layer={layer} onRest={rest} onClose={close} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        anchor.doc.body,
      )}
    </>
  );
}
