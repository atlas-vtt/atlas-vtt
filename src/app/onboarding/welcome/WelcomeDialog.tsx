import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { App } from 'obsidian';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import type { SettingsService } from '../../services/SettingsService';
import type { LookService } from '../../appearance/lookService';
import { useAtlasSettings, useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { portalHost } from '../../host/portalHost';
import { useDialogFocus } from '../useDialogFocus';
import { HelpPage, LookPage, SidebarPage } from './welcomePages';
import { t } from '../../i18n';
import './welcome.scss';

interface WelcomeDialogProps {
  app: App;
  settings: SettingsService;
  looks: LookService;
  /** The first page: what Atlas is, in slides. */
  carousel: React.ReactNode;
}

type WelcomePage = 'carousel' | 'help' | 'sidebar' | 'look';
const PAGES: readonly WelcomePage[] = ['carousel', 'help', 'sidebar', 'look'];

/**
 * The welcome wizard: a large dialog of four pages, what Atlas is, where help is, Atlas Sidebar and the look. Skip,
 * Close, Escape and Start playing all end it, and the tours follow.
 */
export function WelcomeDialog(props: WelcomeDialogProps): React.JSX.Element | null {
  // Subscribed, so it closes as soon as it is completed.
  useAtlasSettings(props.settings);
  return props.settings.shouldShowTutorial('welcome') ? <WelcomeWindow {...props} /> : null;
}

function WelcomeWindow({ app, settings, looks, carousel }: WelcomeDialogProps): React.JSX.Element {
  const [at, setAt] = useState(0);
  const windowRef = useRef<HTMLDivElement>(null);
  const windowVariants = useDialogWindowVariants();
  const key = useHotkeyLabels();
  const finish = useCallback(() => settings.completeTutorial('welcome'), [settings]);
  const last = at === PAGES.length - 1;
  const forward = (): void => { if (last) finish(); else setAt(at + 1); };
  const back = (): void => setAt(Math.max(0, at - 1));

  useDialogFocus(windowRef, finish);
  // The page's main button keeps the focus, so Enter always goes on.
  useEffect(() => { windowRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, [at]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowRight' && !last) { event.preventDefault(); setAt(at + 1); }
    else if (event.key === 'ArrowLeft' && at > 0) { event.preventDefault(); back(); }
  };

  const page = PAGES[at]!;
  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-welcome-overlay">
      <motion.div
        ref={windowRef}
        variants={windowVariants}
        className="atlas-welcome"
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.welcome.label')}
        onKeyDown={onKeyDown}
      >
        <CloseButton className="atlas-welcome__close" onClick={finish} />
        <div className="atlas-welcome__page" key={page} data-page={page}>
          {page === 'carousel' && carousel}
          {page === 'help' && <HelpPage paletteKey={key('palette')} />}
          {page === 'sidebar' && <SidebarPage app={app} />}
          {page === 'look' && <LookPage looks={looks} />}
        </div>
        <div className="atlas-welcome__foot">
          <span className="atlas-welcome__progress">
            <span className="atlas-welcome__progress-label">{t('tour.progress', { step: at + 1, total: PAGES.length })}</span>
            {PAGES.map((name, index) => <span key={name} aria-hidden="true" className="atlas-welcome__bar" data-done={index <= at} />)}
          </span>
          {at === 0
            ? <Button variant="ghost" onClick={finish}>{t('tour.skip')}</Button>
            : <Button variant="ghost" onClick={back}>{t('common.back')}</Button>}
          <Button key={last ? 'start' : 'next'} data-autofocus onClick={forward}>
            {last ? t('tour.welcome.start') : t('tour.next')}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    portalHost(),
  );
}
