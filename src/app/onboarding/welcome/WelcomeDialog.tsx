import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import type { App } from 'obsidian';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { useDialogWindowVariants, usePrefersReducedMotion } from '../../packages/components/primitives/dialogMotion';
import type { SettingsService } from '../../services/SettingsService';
import type { LookService } from '../../appearance/lookService';
import { useAtlasSettings, useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { portalHost } from '../../host/portalHost';
import { useDialogFocus } from '../useDialogFocus';
import { HelpPage, LookPage, SidebarPage } from './welcomePages';
import { WelcomeFootStart } from './welcomeFoot';
import { useWelcomeIntro, WelcomeIntro } from './welcomeIntro';
import { welcomeOverlayMotion, welcomeWindowVariants } from './welcomeMotion';
import { useWelcomeOwner } from './useWelcomeOwner';
import { t } from '../../i18n';
import './welcome.scss';
import './intro.scss';

interface WelcomeDialogProps {
  app: App;
  settings: SettingsService;
  looks: LookService;
  /** The first page: what Atlas is, in slides. */
  carousel: React.ReactNode;
  /** Whether this GM is to be welcomed at all (`shouldWelcome`); completing the wizard closes it either way. */
  open?: boolean;
  /** The document of the view it welcomes in, a popout's included; the main window's by default. */
  doc?: Document;
}

type WelcomePage = 'carousel' | 'help' | 'look' | 'sidebar';
const PAGES: readonly WelcomePage[] = ['carousel', 'help', 'look', 'sidebar'];

/**
 * The welcome wizard: a large dialog of four pages, what Atlas is, where help is, the look and Atlas Sidebar. Skip,
 * Close, Escape and Start playing all end it, and the tours follow. One shows per app, however many views mount it.
 */
export function WelcomeDialog({ open = true, ...props }: WelcomeDialogProps): React.JSX.Element {
  // Subscribed, so it closes as soon as it is completed, with the dialogs' closing motion: keep it mounted after.
  useAtlasSettings(props.settings);
  const owns = useWelcomeOwner(props.app);
  const shown = open && owns && props.settings.shouldShowTutorial('welcome');
  return <AnimatePresence>{shown && <WelcomeWindow key="welcome" {...props} />}</AnimatePresence>;
}

function WelcomeWindow({ app, settings, looks, carousel, doc }: Omit<WelcomeDialogProps, 'open'>): React.JSX.Element {
  const [at, setAt] = useState(0);
  // Where the carousel puts its chips: the foot's start, in place of the pages' bars.
  const [footStart, setFootStart] = useState<HTMLElement | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const fadingVariants = useDialogWindowVariants();
  const windowVariants = reducedMotion ? fadingVariants : welcomeWindowVariants;
  const intro = useWelcomeIntro(reducedMotion);
  const key = useHotkeyLabels();
  const finish = useCallback(() => settings.completeTutorial('welcome'), [settings]);
  const last = at === PAGES.length - 1;
  const forward = (): void => { if (last) finish(); else setAt(at + 1); };
  const back = (): void => setAt(Math.max(0, at - 1));

  // Fading out, it leaves the keys and the focus to the tour that follows.
  const present = useIsPresent();
  useDialogFocus(windowRef, finish, present);
  // The page's main button keeps the focus, so Enter always goes on.
  useEffect(() => { windowRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, [at]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowRight' && !last) { event.preventDefault(); setAt(at + 1); }
    else if (event.key === 'ArrowLeft' && at > 0) { event.preventDefault(); back(); }
  };

  const page = PAGES[at]!;
  return createPortal(
    <motion.div {...welcomeOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-welcome-overlay">
      {/* The window moves as one piece and does not clip, so a look's ornament hangs from it and moves and fades with
          it; the dialog inside clips its pages to the corners. */}
      <motion.div variants={windowVariants} className="atlas-welcome-window">
        <div
          ref={windowRef}
          className="atlas-welcome"
          data-page={page}
          data-opening={intro.opening || undefined}
          style={intro.style}
          role="dialog"
          aria-modal="true"
          aria-label={t('tour.welcome.label')}
          onKeyDown={onKeyDown}
        >
          <CloseButton className="atlas-welcome__close" onClick={finish} />
          <div className="atlas-welcome__page" key={page}>
            {page === 'carousel' && (
              <WelcomeIntro.Provider value={intro.state}>
                <WelcomeFootStart.Provider value={footStart}>{carousel}</WelcomeFootStart.Provider>
              </WelcomeIntro.Provider>
            )}
            {page === 'help' && <HelpPage paletteKey={key('palette')} />}
            {page === 'sidebar' && <SidebarPage app={app} />}
            {page === 'look' && <LookPage app={app} looks={looks} />}
          </div>
          <div className="atlas-welcome__foot">
            <div className="atlas-welcome__progress">
              <span className="atlas-welcome__progress-label">{t('tour.progress', { step: at + 1, total: PAGES.length })}</span>
              {page === 'carousel'
                ? <div ref={setFootStart} className="atlas-welcome__foot-start" />
                : PAGES.map((name, index) => <span key={name} aria-hidden="true" className="atlas-welcome__bar" data-done={index <= at} />)}
            </div>
            {at === 0
              ? <Button variant="ghost" onClick={finish}>{t('tour.skip')}</Button>
              : <Button variant="ghost" onClick={back}>{t('common.back')}</Button>}
            <Button key={last ? 'start' : 'next'} data-autofocus onClick={forward}>
              {last ? t('tour.welcome.start') : t('tour.next')}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    portalHost(doc),
  );
}
