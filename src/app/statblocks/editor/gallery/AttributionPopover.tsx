import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { cn } from '../../../../utils/cn';
import type { TemplateSource } from '../../model/templateTypes';
import { t } from '../../../i18n';

/** The full credit of a licensed template (§10.5): attribution, licence link, Atlas' change and a trademark line where the source has one. */
export function AttributionText({ source, headingId }: { source: TemplateSource; headingId?: string | undefined }): React.JSX.Element {
  return (
    <>
      <h3 id={headingId} className="atlas-te-attribution__heading">{source.system}</h3>
      <p className="atlas-te-attribution__text">{source.attribution}</p>
      <p className="atlas-te-attribution__text">{source.modification}</p>
      {source.trademarkNotice && <p className="atlas-te-attribution__text">{source.trademarkNotice}</p>}
      <a className="atlas-te-attribution__link" href={source.licenceUrl} target="_blank" rel="noopener noreferrer">{t('statblockEditor.readLicence')}</a>
    </>
  );
}

interface AttributionButtonProps {
  source: TemplateSource;
  /** What the template is called, which names the button. */
  name: string;
  /** The gallery's overlay: the popover is drawn there, above the cards' clipping. */
  layer: HTMLElement | null;
}

/** The info button of a licensed card, and the popover with its full attribution. */
export function AttributionButton({ source, name, layer }: AttributionButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const variants = useAnchoredPopoverVariants();
  const keepInView = useKeepInView(popoverRef, open, 'bottom', anchor ? `${anchor.left},${anchor.top}` : undefined);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  // The overlay covers its window, so the button's place in the window is its place in the overlay.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (!open || !button) return;
    const box = button.getBoundingClientRect();
    setAnchor({ left: box.left, top: box.bottom });
  }, [open]);

  useEffect(() => {
    if (open) popoverRef.current?.focus({ preventScroll: true });
  }, [open, anchor]);

  useEffect(() => {
    const doc = buttonRef.current?.doc;
    if (!open || !doc) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (![popoverRef.current, buttonRef.current].some((element) => element && path.includes(element))) setOpen(false);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => doc.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const style: React.CSSProperties & Record<`--${string}`, string> = {
    ...keepInView.style,
    '--atlas-te-attribution-x': `${anchor?.left ?? 0}px`,
    '--atlas-te-attribution-y': `${anchor?.top ?? 0}px`,
  };

  return (
    <>
      <LabelTooltip label={t('statblockEditor.whereFrom', { name })}>
        <Button
          ref={buttonRef}
          type="button"
          variant="ghost"
          size="icon"
          className="atlas-te-gallery-card__info"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((was) => !was);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Info aria-hidden="true" />
        </Button>
      </LabelTooltip>
      {layer && createPortal(
        <AnimatePresence>
          {open && anchor && (
            <div
              key="attribution"
              ref={popoverRef}
              className={cn('atlas-te-attribution', keepInView.capped && 'atlas-keep-in-view--capped')}
              style={style}
              role="dialog"
              aria-labelledby={headingId}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                // The gallery reads the key as used and stays open.
                event.preventDefault();
                close();
              }}
            >
              <motion.div className="atlas-te-attribution__panel" variants={variants} initial="hidden" animate="visible" exit="exit">
                <AttributionText source={source} headingId={headingId} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        layer,
      )}
    </>
  );
}
