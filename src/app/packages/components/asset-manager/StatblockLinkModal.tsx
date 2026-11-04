import React, { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Unlink } from 'lucide-react';
import { App } from 'obsidian';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { useDialogEscape } from '../primitives/useDialogEscape';
import { filterStatblockEntries } from './statblock-link/statblockEntries';
import { StatblockList } from './statblock-link/StatblockList';
import { StatblockPreviewPane, type StatblockPreviewToken } from './statblock-link/StatblockPreviewPane';
import { useStatblockEntries, type BestiaryStatus } from './statblock-link/useStatblockEntries';
import { NewStatblockButton } from '../../../statblocks/editor/create/RoleMenu';
import type { NewStatblockOption } from '../../../statblocks/editor/create/roleChoices';
import { t } from '../../../i18n';

interface StatblockLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Only the name, art and current link are shown, so callers without a full asset can use the modal. */
  asset: StatblockPreviewToken & { statblockPath?: string | undefined };
  onLink: (statblockPath: string | null) => void;
  app: App;
  /** "New statblock…" at the dialog's end, made for this token; absent while the statblock editor is off. */
  newStatblock?: NewStatblockOption | undefined;
}

const EMPTY_MESSAGES: Record<Exclude<BestiaryStatus, 'loading'>, React.ReactNode> = {
  missing: t('am.link.missing'),
  ready: (
    <>
      No statblock notes found. Add a statblock code block to a note (<code>monster: Goblin</code> is enough for a
      bestiary creature), or enable &quot;Parse Frontmatter for Creatures&quot; in the Fantasy Statblocks settings.
    </>
  ),
};

/** What the list says when it has no rows; nothing while the creatures are read, when placeholder rows stand in. */
function emptyMessage(hasEntries: boolean, status: BestiaryStatus): React.ReactNode {
  if (hasEntries) return t('sbImport.noMatch');
  return status === 'loading' ? null : EMPTY_MESSAGES[status];
}

/**
 * Links a token to a Fantasy Statblocks creature: search on the left, the
 * selected creature's statblock on the right. Arrow keys move through the
 * results, Enter or a double click links.
 */
const StatblockLinkModal: React.FC<StatblockLinkModalProps> = ({ isOpen, onClose, asset, onLink, app, newStatblock }) => {
  const { entries, status } = useStatblockEntries(app);
  const linkedPath = asset.statblockPath || null;
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(linkedPath);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idPrefix = useId();
  const windowVariants = useDialogWindowVariants();
  // While the role menu is open, Escape closes the menu only.
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  useDialogEscape(dialogRef, isOpen && !roleMenuOpen ? onClose : undefined);

  const results = useMemo(() => filterStatblockEntries(entries, query), [entries, query]);
  // A selection the search hides gives way to the first result.
  const selectedIndex = results.findIndex((entry) => entry.path === selectedPath);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : results.length > 0 ? 0 : -1;
  const activePath = results[activeIndex]?.path ?? null;
  // Rendering a statblock takes a moment; the list keeps up with the keyboard meanwhile.
  const previewPath = useDeferredValue(activePath);
  const optionId = (index: number): string => `${idPrefix}-option-${index}`;

  useEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  const link = (path: string | null): void => {
    onLink(path);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = results[Math.min(results.length - 1, Math.max(0, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) setSelectedPath(next.path);
    } else if (event.key === 'Enter' && activePath) {
      event.preventDefault();
      link(activePath);
    }
  };

  if (!isOpen) return null;

  const hasEntries = entries.length > 0;
  const unlinkButton = linkedPath && (
    <Button variant="ghost" size="sm" className="atlas-statblock-link__unlink" onClick={() => link(null)}>
      <Unlink />
      {t('am.link.unlink')}
    </Button>
  );

  return (
    <motion.div {...dialogOverlayMotion} className="atlas-modal-overlay" onClick={onClose}>
      <motion.div
        ref={dialogRef}
        className="atlas-statblock-link"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        variants={windowVariants}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="atlas-modal-header">
          <div className="atlas-statblock-link__heading">
            <h2 id={`${idPrefix}-title`}>{t('am.link.title')}</h2>
            <span className="atlas-statblock-link__subtitle">For {asset.name}</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="atlas-statblock-link__body">
          <div className="atlas-statblock-link__browser">
            <div className="atlas-statblock-link__search">
              <Search aria-hidden />
              {/* Named without aria-label, which Obsidian shows as its own tooltip. */}
              <span id={`${idPrefix}-search-label`} hidden>{t('am.link.search')}</span>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={`${idPrefix}-list`}
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                aria-labelledby={`${idPrefix}-search-label`}
                placeholder={t('am.link.searchPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                disabled={!hasEntries}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <StatblockList
              id={`${idPrefix}-list`}
              labelId={`${idPrefix}-title`}
              entries={results}
              activePath={activePath}
              linkedPath={linkedPath}
              optionId={optionId}
              onActivate={setSelectedPath}
              onChoose={link}
              loading={status === 'loading'}
              empty={emptyMessage(hasEntries, status)}
            />
          </div>
          <StatblockPreviewPane app={app} path={previewPath} token={asset} />
        </div>

        <div className="atlas-modal-footer">
          {newStatblock ? (
            <div className="atlas-statblock-link__start">
              <NewStatblockButton
                className="atlas-statblock-link__new"
                choices={newStatblock.choices}
                onMenuOpenChange={setRoleMenuOpen}
                onChoose={(roleId) => {
                  onClose();
                  newStatblock.onChoose(roleId);
                }}
              />
              {unlinkButton}
            </div>
          ) : unlinkButton}
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={!activePath || activePath === linkedPath} onClick={() => { if (activePath) link(activePath); }}>
            {t('am.link.link')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StatblockLinkModal;
