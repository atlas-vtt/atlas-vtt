import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { tablesOfNote } from '../../../randomTables/noteTables';
import { readPastedTable, type PastedTable } from '../../../randomTables/pastedTable';
import { tableNoteText } from '../../../randomTables/tableMarkdown';
import { guessTableKind } from '../../../randomTables/tableKind';
import type { RandomTable } from '../../../randomTables/tableModel';
import type { RandomTableKind } from '../../../types/randomTableTypes';
import { TablePreview } from './TablePreview';
import { FileTableImport } from './FileTableImport';
import type { ImportedTableNote, ImportSaveJournal } from '../../../randomTables/import/saveImportedTables';
import { IMPORT_LIMITS, validateImportTable } from '../../../randomTables/import/importModel';
import { t } from '../../../i18n';

const KINDS = [
  { value: 'text', label: t('tables.kind.text') },
  { value: 'items', label: t('tables.kind.items') },
] as const;

/** What the dialog saves: the table as pasted, its name and what it gives. */
export interface PastedTableNote {
  name: string;
  kind: RandomTableKind;
  table: PastedTable;
}

interface PasteTableDialogProps {
  /** The folder the note is written to, as the footer names it. */
  folder: string;
  onSave: (note: PastedTableNote, journal: ImportSaveJournal) => void | Promise<void>;
  onImport?: (notes: readonly ImportedTableNote[], journal: ImportSaveJournal) => Promise<void>;
  onClose: () => void;
}

/** The paste read as a table and as the note will read it back, or null while it holds no rows. */
function usePreview(text: string, name: string): { pasted: PastedTable; table: RandomTable } | null {
  return useMemo(() => {
    const pasted = readPastedTable(text, { resultHeader: t('tables.paste.resultColumn'), rollHeader: t('tables.paste.rollColumn') });
    if (!pasted || pasted.rows.length === 0) return null;
    const title = name.trim() || t('tables.paste.untitled');
    const table = tablesOfNote(tableNoteText(title, pasted), title).tables[0];
    return table ? { pasted, table } : null;
  }, [text, name]);
}

/**
 * New table: pasted text (a PDF's lines, a spreadsheet's rows, a Markdown table) shown as the
 * table it will be, read only, with what is wrong with it; Save writes it as a new note. No row,
 * cell or range is edited here: what the preview finds wrong is fixed in the text or the note.
 */
export function PasteTableDialog({ folder, onSave, onImport, onClose }: PasteTableDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [chosenKind, setChosenKind] = useState<RandomTableKind | null>(null);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [saving, setSaving] = useState(false);
  const [hasWrites, setHasWrites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savePending = useRef(false);
  const pasteJournal = useRef<ImportSaveJournal>(new Map());
  const dialogRef = useRef<HTMLDivElement>(null);
  const [doc] = useState(() => activeDocument);
  const preview = usePreview(text, name);
  const kind = chosenKind ?? (preview ? guessTableKind(preview.table.columns) : 'text');
  const canSave = name.trim() !== '' && preview !== null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !handledByAnotherControl(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (!saving) onClose();
      }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), textarea:not(:disabled)') ?? [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    doc.addEventListener('keydown', handleKeyDown, true);
    return () => doc.removeEventListener('keydown', handleKeyDown, true);
  }, [doc, onClose, saving]);

  const savePaste = async (): Promise<void> => {
    if (savePending.current || !preview || !canSave) return;
    savePending.current = true;
    setSaving(true);
    setError(null);
    try {
      validateImportTable(preview.pasted, name.trim());
      await onSave({ name: name.trim(), kind, table: preview.pasted }, pasteJournal.current);
      onClose();
    } catch {
      setError(t('tables.paste.saveFailed'));
    } finally {
      savePending.current = false;
      setSaving(false);
      setHasWrites(pasteJournal.current.size > 0);
    }
  };

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-paste-table-overlay" onMouseDown={(e) => e.stopPropagation()}>
      <div className="atlas-paste-table__backdrop" onClick={() => { if (!saving) onClose(); }} />
      <motion.div ref={dialogRef} className="atlas-paste-table" variants={windowVariants} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="atlas-paste-table__header">
          <h3 id={titleId}>{t('tables.newTable')}</h3>
          <CloseButton disabled={saving} onClick={onClose} aria-label={t('common.cancel')} />
        </header>
        {onImport && <div className="atlas-file-tables__mode"><SegmentedControl value={mode}
          options={[{ value: 'paste', label: t('tables.import.paste') }, { value: 'file', label: t('tables.import.mode') }]}
          ariaLabel={t('tables.import.source')} disabled={saving || hasWrites} onChange={setMode} /></div>}
        {mode === 'file' && onImport ? <FileTableImport folder={folder} onSave={onImport} onClose={onClose}
          onStateChange={(busy, written) => { setSaving(busy); setHasWrites(written); }} /> : <>
        <div className="atlas-paste-table__body">
          <div className="atlas-paste-table__input">
            <div className="atlas-paste-table__row">
              <input
                type="text"
                className="atlas-csm-input"
                value={name}
                placeholder={t('tables.paste.name')}
                aria-label={t('tables.paste.name')}
                autoFocus
                disabled={saving || hasWrites}
                maxLength={IMPORT_LIMITS.nameCharacters}
                onChange={(event) => setName(event.target.value)}
              />
              <SegmentedControl<RandomTableKind> value={kind} options={KINDS} ariaLabel={t('tables.paste.kind')} disabled={saving || hasWrites} onChange={setChosenKind} />
            </div>
            <textarea
              className="atlas-paste-table__text"
              value={text}
              aria-label={t('tables.paste.text')}
              placeholder={t('tables.paste.hint')}
              spellCheck={false}
              disabled={saving || hasWrites}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="atlas-paste-table__preview" aria-live="polite">
            {error && <p role="alert" className="atlas-file-tables__error">{error}</p>}
            {hasWrites && <p className="atlas-file-tables__hint">{t('tables.import.retryHint')}</p>}
            {preview ? <TablePreview table={preview.table} /> : <p className="atlas-paste-table__empty">{t('tables.paste.empty')}</p>}
          </div>
        </div>
        <footer className="atlas-paste-table__footer">
          <span className="atlas-paste-table__folder">{t('tables.paste.savedIn', { folder })}</span>
          <Button variant="ghost" disabled={saving} onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="default"
            disabled={!canSave || saving}
            onClick={() => { void savePaste(); }}
          >
            {t('tables.paste.save')}
          </Button>
        </footer>
        </>}
      </motion.div>
    </motion.div>,
    doc.body,
  );
}
