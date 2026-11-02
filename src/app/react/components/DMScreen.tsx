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
import { useNoteFocus } from './dm-screen/useNoteFocus';

interface DMScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

const PAGES: readonly SegmentedOption<DMScreenPage>[] = [
  { value: 'statblocks', label: t('audio.screen.statblocks') },
  { value: 'sound', label: t('audio.screen.sound') },
];

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
  const [contentReady, setContentReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [isNoteFocused, setIsNoteFocused] = useNoteFocus(isOpen, screenRef);
  // Mounted on first open, and kept: what it shows lives in the sound's owner anyway.
  const [soundOpened, setSoundOpened] = useState(false);
  if (page === 'sound' && isOpen && !soundOpened) setSoundOpened(true);
  if (!isOpen && soundOpened) setSoundOpened(false);

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

  // The arrow keys change pages while no control is in focus, or the page control itself is.
  useEffect(() => {
    if (!isOpen || !soundOn) return undefined;
    const handleArrow = (e: KeyboardEvent): void => {
      const direction = arrowDirection(e.key);
      if ((direction !== 'left' && direction !== 'right') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isNoteFocused || !screenTakesKey(e, screenRef.current, view?.viewId)) return;
      const target = e.target as Element | null;
      const onPages = target?.closest?.('.atlas-dm-screen-pages') != null;
      if (isControlTarget(target) && !onPages) return;
      if (target?.closest?.('.atlas-dm-notes-section')) return;
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

      <div className={`atlas-dm-screen ${closing ? 'is-closing' : contentReady ? 'is-visible' : ''}`}>
        {soundOn && (
          <div className="atlas-dm-screen-header">
            <SegmentedControl className="atlas-dm-screen-pages" value={page} options={PAGES} onChange={setPage} ariaLabel={t('audio.screen.pages')} roving />
            <div className="atlas-dm-screen-header__page" ref={setHeaderSlot} />
          </div>
        )}
        {/* Stays mounted while hidden: the note's editor needs its own cleanup, and statblocks are not loaded twice. */}
        <div className="atlas-dm-screen-content" hidden={page !== 'statblocks'}>
          <DMStatblocksPane app={app} statblocks={statblocks} loading={loading} onClose={handleClose} />
          <DMNotePane app={app} onNoteFocus={() => setIsNoteFocused(true)} />
        </div>
        {soundOn && soundOpened && (
          <div className="atlas-dm-sound-page" hidden={page !== 'sound'}>
            <SoundPane active={page === 'sound'} headerSlot={headerSlot} />
          </div>
        )}
      </div>
    </div>
  );
}
