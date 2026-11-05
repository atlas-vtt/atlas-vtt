import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { matchesMapHotkey } from '../../keyboard/mapHotkeys';
import { SegmentedControl, type SegmentedOption } from '../../packages/components/primitives/SegmentedControl';
import { SettingsService } from '../../services/SettingsService';
import type { DMScreenPage } from '../../types/viewUIState';
import { isShortcutScopeActive } from '../../utils/activeLeafGuard';
import { useExperimentalFeature } from '../hooks/useExperimentalFeature';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';
import { DMNotePane } from './dm-screen/DMNotePane';
import { DMStatblocksPane } from './dm-screen/DMStatblocksPane';
import { arrowDirection, isControlTarget, screenTakesKey } from './dm-screen/screenKeys';
import { SoundPane } from './dm-screen/sound/SoundPane';
import { useDMScreenStatblocks } from './dm-screen/useDMScreenStatblocks';
import { useFightStatblocks } from './dm-screen/useFightStatblocks';
import { useNoteFocus } from './dm-screen/useNoteFocus';
import { sideOf, usePageTurn } from './dm-screen/usePageTurn';

interface DMScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGES: readonly SegmentedOption<DMScreenPage>[] = [
  { value: 'statblocks', label: t('audio.screen.statblocks') },
  { value: 'sound', label: t('audio.screen.sound') },
];

/**
 * True from the first render that shows the page until the screen closes: a page is mounted the first time it
 * is shown and then kept while the screen stays open.
 */
function usePageOpened(shown: boolean, isOpen: boolean): boolean {
  const [opened, setOpened] = useState(false);
  if (shown && isOpen && !opened) setOpened(true);
  if (!isOpen && opened) setOpened(false);
  return opened;
}

/**
 * The DM screen as the view's store opens and closes it. It reads the open state itself, so opening the screen
 * renders the screen alone and not the map's whole interface (the toolbar would measure itself again).
 */
export function DMScreenFromStore(): React.JSX.Element | null {
  const isOpen = useAtlasStore((state) => state.isDMScreenOpen);
  const setOpen = useAtlasStore((state) => state.setDMScreenOpen);
  // Give CodeMirror time to clean up before closing.
  const close = useCallback((): void => { window.setTimeout(() => setOpen(false), 0); }, [setOpen]);
  return <DMScreen isOpen={isOpen} onClose={close} />;
}

export default function DMScreen({ isOpen, onClose }: DMScreenProps): React.JSX.Element | null {
  const tokens = useAtlasStore((state) => state.objects?.tokens || {});
  const mapPath = useAtlasStore((state) => state.mapPath);
  const mapLoaded = useAtlasStore((state) => state.mapLoaded);
  const isMapLoading = useAtlasStore((state) => state.isMapLoading);
  const storedPage = useAtlasStore((state) => state.dmScreenPage);
  const setPage = useAtlasStore((state) => state.setDMScreenPage);
  const { app, view } = useAtlasUI();
  const soundOn = useExperimentalFeature('sound', SettingsService.forApp(app));
  const page: DMScreenPage = soundOn ? storedPage : 'statblocks';
  const { statblocks, loading } = useDMScreenStatblocks(isOpen, app, { viewId: view?.viewId, mapPath, mapLoaded, isMapLoading, tokens });
  const { shown, scopeSwitch } = useFightStatblocks(statblocks, tokens);
  const [contentReady, setContentReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const [isNoteFocused, setIsNoteFocused] = useNoteFocus(isOpen, screenRef);
  // Mounted on first open, and kept: what it shows lives in the sound's owner anyway.
  const soundOpened = usePageOpened(page === 'sound', isOpen);
  // The note beside the statblocks (an editor, or the picker that reads every note) waits until its page shows.
  const statblocksOpened = usePageOpened(page === 'statblocks', isOpen);
  const leaving = usePageTurn(page, isOpen);
  /** A page at rest is shown or hidden; while pages turn, the one left slides out to its side and the one chosen in from its own. */
  const pageProps = (of: DMScreenPage): React.ComponentProps<'div'> & { 'data-page': string; 'data-from': string | undefined } => ({
    hidden: of !== page && of !== leaving,
    inert: of !== page,
    'data-page': of === page ? 'current' : sideOf(of, page),
    'data-from': of === page && leaving !== null ? sideOf(of, leaving) : undefined,
  });

  // Animated close: play exit animation, then call the real onClose
  const handleClose = useCallback((): void => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200); // matches CSS animation duration
  }, [closing, onClose]);

  // Reveal the DM screen once statblocks finish loading (prevents layout shift)
  useEffect(() => {
    if (!isOpen) {
      setContentReady(false);
      return;
    }
    if (!loading) {
      // Use rAF to ensure the browser has painted the final layout before animating in
      const id = window.requestAnimationFrame(() => setContentReady(true));
      return () => window.cancelAnimationFrame(id);
    }
  }, [loading, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e: KeyboardEvent): void => {
      // A focused note keeps its keys (they stop at the note's own section).
      if (isNoteFocused) return;
      if (e.defaultPrevented || !isShortcutScopeActive(screenRef.current, view?.viewId)) return;
      if (document.querySelector('.atlas-onboarding-overlay, .atlas-hotkey-help, .modal-container')) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (matchesMapHotkey(e, 'dashboard', SettingsService.forApp(app))) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, isNoteFocused, app, view]);

  // Left and right change pages, as a game's shoulder buttons do; the keycaps beside the page control say so.
  // On the Sound page they always do, since nothing there takes the arrows for focus (owner, 2026-11-03);
  // on the statblocks page a control in focus keeps them (tab strips, selects), and a note's editor always.
  useEffect(() => {
    if (!isOpen || !soundOn) return undefined;
    const handleArrow = (e: KeyboardEvent): void => {
      const direction = arrowDirection(e.key);
      if ((direction !== 'left' && direction !== 'right') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isNoteFocused || !screenTakesKey(e, screenRef.current, view?.viewId)) return;
      const target = e.target as Element | null;
      const onPages = target?.closest?.('.atlas-dm-screen-pages') != null;
      if (page === 'statblocks' && isControlTarget(target) && !onPages) return;
      if (target?.closest?.('.atlas-dm-notes-section, [aria-expanded="true"], [role="listbox"]')) return;
      e.preventDefault();
      e.stopPropagation();
      const next: DMScreenPage = page === 'statblocks' ? 'sound' : 'statblocks';
      setPage(next);
      if (onPages) screenRef.current?.querySelector<HTMLElement>(`.atlas-dm-screen-pages .atlas-segmented__option:nth-of-type(${next === 'statblocks' ? 1 : 2})`)?.focus();
    };
    window.addEventListener('keydown', handleArrow, true);
    return () => window.removeEventListener('keydown', handleArrow, true);
  }, [isOpen, soundOn, page, setPage, isNoteFocused, view]);

  if (!isOpen) return null;

  return (
    <div className="atlas-dm-screen-wrapper" ref={screenRef} tabIndex={-1}>
      <div className={`atlas-dm-screen-backdrop ${closing ? 'is-closing' : ''}`} onClick={handleClose} />

      <div className={`atlas-dm-screen ${soundOn ? 'atlas-dm-screen--pages' : ''} ${closing ? 'is-closing' : contentReady ? 'is-visible' : ''}`}>
        {soundOn && (
          <div className="atlas-dm-screen-header">
            <kbd className="atlas-dm-screen-key" aria-hidden="true">←</kbd>
            <SegmentedControl className="atlas-dm-screen-pages" value={page} options={PAGES} onChange={setPage} ariaLabel={t('audio.screen.pages')} roving />
            <kbd className="atlas-dm-screen-key" aria-hidden="true">→</kbd>
          </div>
        )}
        <div className="atlas-dm-screen-stage" data-turning={leaving !== null || undefined}>
          {/* Stays mounted while hidden: the note's editor needs its own cleanup, and statblocks are not loaded twice. */}
          <div className="atlas-dm-screen-content atlas-dm-page" {...pageProps('statblocks')}>
            <DMStatblocksPane app={app} shown={shown} scopeSwitch={scopeSwitch} loading={loading} onClose={handleClose} />
            <DMNotePane app={app} shown={statblocksOpened} onNoteFocus={() => setIsNoteFocused(true)} />
          </div>
          {soundOn && soundOpened && (
            <div className="atlas-dm-sound-page atlas-dm-page" {...pageProps('sound')}>
              <SoundPane active={page === 'sound'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
