import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { ProgressBar } from '../../primitives/ProgressBar';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES, BESTIARY_TOKEN_COUNT } from '../../../../services/stockPacks/bestiaryTokens';
import { EASE_OUT_CONTROL_POINTS, MOTION_NORMAL_MS } from '../../../../utils/motion';
import { useCloseOutside, useStarterTokens } from '../hooks/useStarterTokens';
import { StarterTokensChoice } from './StarterTokensChoice';

const FADE = { duration: MOTION_NORMAL_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };

/**
 * Offers the starter tokens until the open collection holds them. The button opens a popover
 * that asks which statblocks they come with, and its Download starts; while they download into
 * this collection, a spinner and a bar say so. `empty` is the empty Tokens tab's call to action,
 * `sidebar` the quiet one at the sidebar's foot for a collection that holds other tokens, which
 * the GM may hide for the collection (`onDismiss`); the header's Create menu still offers them.
 */
export function BestiaryTokensOffer({ app, assets, collection, variant, fallback = null, secondary = null, dismissed = false, onDismiss }: {
  app: App;
  assets: AssetService;
  collection: string;
  variant: 'empty' | 'sidebar';
  /** Shown in the offer's place once the collection holds the pack (the empty state's own hint). */
  fallback?: React.ReactNode;
  /** The empty state's other way in, beside the download button ("or add your own"). */
  secondary?: React.ReactNode;
  /** The sidebar's offer is hidden for this collection: it fades out, and in again when it comes back. */
  dismissed?: boolean;
  /** Hides the sidebar's offer for this collection; without it the offer has no ×. */
  onDismiss?: () => void;
}): React.JSX.Element | null {
  const starter = useStarterTokens(app, assets, collection);
  const { download, downloading, busy, choice, setChoice } = starter;
  const [choosing, setChoosing] = useState(false);
  const [fromKeys, setFromKeys] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const close = useCallback((): void => setChoosing(false), []);
  useCloseOutside(anchor, choosing, close);
  useEffect(() => setChoosing(false), [assets, collection, dismissed]);
  if (!downloading && starter.present !== false) return <>{fallback}</>;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  // The button keeps one label while it downloads, so it never changes size; the bar below says how far it got.
  const label = downloading ? t('am.bestiary.downloading') : t(variant === 'empty' ? 'am.bestiary.offer' : 'am.bestiary.get', { count: BESTIARY_TOKEN_COUNT });
  const percent = download.phase === 'downloading' ? Math.floor(download.share * 100) : 0;
  const progress = downloading && (
    <ProgressBar className="atlas-bestiary-offer__progress" value={percent} max={100} label={t('am.bestiary.downloading')} valueText={`${percent}%`} />
  );
  const start = (): void => {
    setChoosing(false);
    starter.start();
  };
  const dismissable = variant === 'sidebar' && onDismiss !== undefined && !downloading;
  const button = (
    <div ref={anchor} className={`atlas-dropdown-menu atlas-starter-anchor${dismissable ? ' atlas-starter-anchor--dismissable' : ''}`}>
      <Button
        variant={variant === 'empty' ? 'default' : 'ghost'}
        className={variant === 'empty' ? 'atlas-bestiary-offer atlas-bestiary-offer--empty' : 'atlas-asset-manager-manage-btn atlas-bestiary-offer atlas-bestiary-offer--sidebar'}
        disabled={busy}
        aria-busy={downloading}
        aria-haspopup="dialog"
        aria-expanded={choosing}
        onClick={(event) => {
          event.stopPropagation();
          // A click the keyboard made has no pointer behind it.
          setFromKeys(event.detail === 0);
          setChoosing((open) => !open);
        }}
      >
        {downloading ? <LoadingSpinner size={14} /> : <Download />}
        <span>{label}</span>
        {/* Named by what it shows ("Get 155 free tokens 19 MB"); the space is not drawn in the flex row. */}
        {variant === 'sidebar' && !downloading && <>{' '}<small>{t('am.bestiary.size', { size })}</small></>}
      </Button>
      {dismissable && (
        <LabelTooltip label={t('am.bestiary.hide')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-bestiary-offer__dismiss"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
          >
            <X />
          </Button>
        </LabelTooltip>
      )}
      {choosing && !busy && (
        <StarterTokensChoice choice={choice} onChoose={setChoice} onDownload={start} onClose={close} placement={variant === 'empty' ? 'bottom' : 'top'} size={size} focusChoice={fromKeys} />
      )}
    </div>
  );
  if (variant === 'sidebar') {
    return (
      <AnimatePresence initial={false}>
        {!dismissed && (
          <motion.div
            key="offer"
            className="atlas-bestiary-offer-block atlas-bestiary-offer-block--sidebar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            {button}
            {progress}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
  return (
    <div className="atlas-starter-offer">
      <p>{t('am.bestiary.lead')}</p>
      <div className="atlas-starter-offer__panel">
        <div className="atlas-starter-offer__actions">
          {button}
          {secondary}
        </div>
        {progress}
      </div>
      <p className="atlas-starter-offer__fine">{t('am.bestiary.fine', { size })}</p>
    </div>
  );
}
