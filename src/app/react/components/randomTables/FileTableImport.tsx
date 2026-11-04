import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { ProgressStatus } from '../../../packages/components/primitives/ProgressStatus';
import { TABLE_FILE_ACCEPT } from '../../../randomTables/import/importFile';
import { IMPORT_LIMITS } from '../../../randomTables/import/importModel';
import { tablesOfNote } from '../../../randomTables/noteTables';
import { tableNoteText } from '../../../randomTables/tableMarkdown';
import type { RandomTableKind } from '../../../types/randomTableTypes';
import { TablePreview } from './TablePreview';
import { useTableFileImport, type FileImportActions } from './useTableFileImport';
import { t } from '../../../i18n';

const KINDS = [{ value: 'text', label: t('tables.kind.text') }, { value: 'items', label: t('tables.kind.items') }] as const;

/** Discovery is read only. A name and a selection are the only decisions before creating Markdown notes. */
export function FileTableImport({ folder, ...actions }: FileImportActions & { folder: string }): React.ReactElement {
  const state = useTableFileImport(actions);
  const fileInput = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState(0);
  const active = state.tables.find((table) => table.id === activeId) ?? state.tables[0];
  const preview = useMemo(() => active ? tablesOfNote(tableNoteText(active.name || 'Table', active.table), 'Table').tables[0] : null, [active]);
  const checked = state.tables.filter((table) => table.selected).length;
  const locked = state.saving || state.hasWrites;
  const task = state.reading ? {
    label: t('tables.import.reading'), done: state.progress?.page ?? 0, total: state.progress?.pages ?? 1,
  } : state.saving ? { label: t('tables.import.saving'), done: 0, total: 1 } : null;

  return <>
    <div className="atlas-paste-table__body atlas-file-tables__body">
      <div className="atlas-paste-table__input atlas-file-tables__input">
        <input ref={fileInput} type="file" className="atlas-file-tables__file" accept={TABLE_FILE_ACCEPT} aria-label={t('tables.import.chooseFile')} disabled={locked}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) { setActiveId(0); state.read(file); }
          }} />
        <div className="atlas-file-tables__choose">
          <Button variant="outline" disabled={locked} onClick={() => fileInput.current?.click()}>{t('tables.import.chooseFile')}</Button>
          <span className="atlas-file-tables__filename">{state.filename}</span>
          {state.reading && <Button variant="ghost" onClick={state.cancelRead}>{t('common.cancel')}</Button>}
        </div>
        <p className="atlas-file-tables__hint">{t('tables.import.formats')}</p>
        <div role="status" aria-live="polite"><ProgressStatus task={task} failed={state.error !== null} /></div>
        {state.error && <p role="alert" className="atlas-file-tables__error">{state.error}</p>}
        {state.hasWrites && <p className="atlas-file-tables__hint">{t('tables.import.retryHint')}</p>}
        {state.warnings.map((warning) => <p key={warning} className="atlas-file-tables__hint">{t(`tables.import.warning.${warning}`)}</p>)}
        {!state.reading && state.filename && state.tables.length === 0 && !state.error && <p className="atlas-file-tables__hint">{t('tables.import.none')}</p>}
        <div className="atlas-file-tables__list" aria-label={t('tables.import.found')}>
          {state.tables.map((table) => {
            const label = table.name.trim() || t('tables.import.unnamed', { number: table.id + 1 });
            const location = table.page ? t('tables.import.page', { page: table.page }) : table.sheet ? t('tables.import.sheet', { sheet: table.sheet }) : table.line ? t('tables.import.line', { line: table.line }) : '';
            return <div key={table.id} className={`atlas-file-tables__candidate${active?.id === table.id ? ' is-active' : ''}`}>
              <input type="checkbox" checked={table.selected} disabled={locked || table.name.trim() === ''}
                aria-label={t('tables.import.check', { name: label })} onChange={(event) => state.update(table.id, { selected: event.target.checked })} />
              <Button variant="ghost" className="atlas-file-tables__candidate-button" aria-label={t('tables.import.preview', { name: label })}
                aria-pressed={active?.id === table.id} onClick={() => setActiveId(table.id)}>
                <span className="atlas-file-tables__name">{label}</span>
                <span className="atlas-file-tables__location">{location}</span>
              </Button>
            </div>;
          })}
        </div>
      </div>
      <div className="atlas-paste-table__preview atlas-file-tables__preview">
        {active && preview ? <>
          <div className="atlas-paste-table__row">
            <input className="atlas-csm-input" type="text" value={active.name} maxLength={IMPORT_LIMITS.nameCharacters} disabled={locked}
              aria-label={t('tables.paste.name')} placeholder={t('tables.paste.name')}
              onChange={(event) => state.update(active.id, { name: event.target.value, ...(event.target.value.trim() === '' ? { selected: false } : {}) })} />
            <SegmentedControl<RandomTableKind> value={active.kind} options={KINDS} ariaLabel={t('tables.paste.kind')} disabled={locked} onChange={(kind) => state.update(active.id, { kind })} />
          </div>
          {active.name.trim() === '' && <p className="atlas-file-tables__hint">{t('tables.import.nameRequired')}</p>}
          {active.headerlessTable && <label className="atlas-file-tables__header-check">
            <input type="checkbox" checked={active.usesHeader} disabled={locked} onChange={(event) => state.update(active.id, { usesHeader: event.target.checked })} />
            {t('tables.import.headerRow')}
          </label>}
          <TablePreview table={preview} />
        </> : <p className="atlas-paste-table__empty">{t('tables.import.empty')}</p>}
      </div>
    </div>
    <footer className="atlas-paste-table__footer">
      <span className="atlas-paste-table__folder">{t('tables.paste.savedIn', { folder })}</span>
      <Button variant="ghost" disabled={state.saving} onClick={actions.onClose}>{t('common.cancel')}</Button>
      <Button variant="default" disabled={checked === 0 || state.reading || state.saving} onClick={state.save}>{t('tables.import.save', { count: checked })}</Button>
    </footer>
  </>;
}
