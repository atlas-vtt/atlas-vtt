import React, { useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Compass, Keyboard, Search } from 'lucide-react';
import { Platform } from 'obsidian';
import { Button } from '../packages/components/primitives/button';
import { CloseButton } from '../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../packages/components/primitives/dialogMotion';
import type { SettingsService } from '../services/SettingsService';
import { useAtlasSettings } from './useMapHotkeys';
import { DEFAULT_MAP_HOTKEYS } from './mapHotkeys';
import { cheatSheetSections, filterCheatSheet, type CheatSheetRow } from './cheatSheetSections';
import { useDialogFocus } from '../onboarding/useDialogFocus';
import { t } from '../i18n';
import { portalHost } from '../host/portalHost';

/** A row's keys: a cap per key, the keys of one way pressed together, other ways after "or". */
function RowKeys({ row }: { row: CheatSheetRow }): React.ReactElement {
  if (row.combos.length === 0) return <span className="atlas-cheat-sheet__unset">{t('hotkey.unassigned')}</span>;
  return (
    <span className="atlas-cheat-sheet__keys">
      {row.combos.map((caps, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="atlas-cheat-sheet__or">{t('hotkey.or')}</span>}
          <kbd className="atlas-cheat-sheet__combo">{caps.map((cap, capIndex) => <kbd key={capIndex} className="atlas-cheat-sheet__cap">{cap}</kbd>)}</kbd>
        </React.Fragment>
      ))}
      {row.gesture && <span className="atlas-cheat-sheet__gesture">{row.gesture}</span>}
    </span>
  );
}

interface HotkeyHelpProps {
  settings?: SettingsService | undefined;
  onClose: () => void;
  isPlayerView?: boolean;
  /** Starts the map tour again; the sheet offers it only where it is given. */
  onTour?: (() => void) | undefined;
}

/** The cheat sheet: every shortcut of the map with the GM's own keys, as caps of the GM's platform, and a search. */
export function HotkeyHelp({ settings: explicit, onClose, isPlayerView = false, onTour }: HotkeyHelpProps): React.JSX.Element {
  const settings = useAtlasSettings(explicit);
  const bindings = settings?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState('');
  useDialogFocus(ref, onClose);
  const windowVariants = useDialogWindowVariants();
  const sections = useMemo(() => cheatSheetSections(bindings, isPlayerView, Platform.isMacOS), [bindings, isPlayerView]);
  const shown = filterCheatSheet(sections, query);

  return createPortal(
    <motion.div className="atlas-vtt-plugin atlas-vtt-root atlas-hotkey-help" {...dialogOverlayMotion} onClick={onClose}>
      <motion.div
        ref={ref}
        variants={windowVariants}
        className="atlas-cheat-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="atlas-cheat-sheet__header">
          <h2 id={titleId}><Keyboard aria-hidden="true" />{t('hotkey.title')}</h2>
          <label className="atlas-cheat-sheet__search">
            <Search aria-hidden="true" />
            <input type="text" value={query} placeholder={t('hotkey.search')} aria-label={t('hotkey.search')} spellCheck={false} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {onTour && (
            <Button variant="ghost" size="sm" className="atlas-cheat-sheet__tour" onClick={onTour}>
              <Compass aria-hidden="true" />{t('tour.replay')}
            </Button>
          )}
          <CloseButton onClick={onClose} aria-label={t('hotkey.close')} />
        </header>
        <div className="atlas-cheat-sheet__body">
          {shown.length > 0 ? (
            <div className="atlas-cheat-sheet__sections">
              {shown.map((section) => (
                <section key={section.title} className="atlas-cheat-sheet__section">
                  <h3>{section.title}</h3>
                  <dl>
                    {section.rows.map((row) => (
                      <div key={row.id} className="atlas-cheat-sheet__row">
                        <dt>{row.label}</dt>
                        <dd><RowKeys row={row} /></dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ) : (
            <p className="atlas-cheat-sheet__empty">{t('hotkey.noMatch', { query: query.trim() })}</p>
          )}
        </div>
        <footer className="atlas-cheat-sheet__footer">{t('hotkey.intro')}</footer>
      </motion.div>
    </motion.div>,
    portalHost(),
  );
}
