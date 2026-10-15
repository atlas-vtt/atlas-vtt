import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal } from 'lucide-react';
import { CoinIcon } from '../CoinIcon';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { useMapCollectionId } from '../../hooks/useMapCollectionId';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../hooks/useDraggablePosition';
import { usePanelResize } from '../../hooks/usePanelResize';
import type { LootDraw } from '../../../loot/lootRoller';
import type { TableResult } from '../../../loot/lootHistory';
import { LootHistoryStore } from '../../../loot/LootHistoryStore';
import { resultMarkdown } from '../../../randomTables/resultMarkdown';
import { baseName } from '../../../utils/pathUtils';
import { useLootHistory } from '../loot/useLootHistory';
import { usePlayerLootIds } from '../loot/usePlayerLoot';
import { PlayerLootDisplay } from '../../../services/PlayerLootDisplay';
import { RarityToggles, RollActions } from '../loot/LootRollBar';
import { LootPaneTabs } from '../loot/LootPaneTabs';
import { LootHistory, LootResults } from '../loot/LootLists';
import { LootEmptyState } from '../loot/LootEmptyState';
import { LootRollerTutorials } from '../loot/LootRollerTutorials';
import { CollectionSettingsModal } from '../CollectionSettingsModal';
import { openTemplateEditor } from '../../../statblocks/editor/openTemplateEditor';
import { useRandomTables } from './useRandomTables';
import { librarySources, selectedSource } from './tableSelection';
import { TablesSidebar } from './TablesSidebar';
import { tableName } from './tableFacts';
import { TableSummary } from './TableSummary';
import { TablesSkeleton } from './TablesSkeleton';
import { useSourceRoll } from './useSourceRoll';
import { openLink, openNote } from './openNote';
import { removeLootBase, removeTableSource, setTableLabel, setTableNoRepeats } from './tableSettingsWrite';
import { PasteTableDialog, type PastedTableNote } from './PasteTableDialog';
import { saveImportedTables, type ImportedTableNote, type ImportSaveJournal } from '../../../randomTables/import/saveImportedTables';
import { tableSourceId } from '../../../randomTables/tableLookup';
import { tablesFolder } from '../../../randomTables/tablePaths';
import { runInBackground } from '../../../utils/backgroundTask';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

const MARGIN = 12;
/** Small enough for a laptop map view, big enough for the source list and one column of cards. */
const MIN_SIZE = { width: 620, height: 420 };
/** Keep the file importer available in code while New table offers only pasted text. */
const FILE_TABLE_IMPORT_ENABLED = false;

/** First placement: the top right of the map, below the scene tabs. */
const topRight = (area: PanelArea, panel: PanelArea): PanelPosition => ({ x: area.width - panel.width - MARGIN, y: 64 });

/** The Random tables window of the map view; shown for the GM while it is open. */
export function RandomTables(): React.ReactElement {
  const open = useAtlasStore((state) => state.lootRoller.open);
  return <AnimatePresence>{open && <RandomTablesPanel key="random-tables" />}</AnimatePresence>;
}

/** True once the library was read once: later reads keep the window as it is. */
function useFirstLoad(loaded: boolean): boolean {
  const [ready, setReady] = useState(loaded);
  useEffect(() => { if (loaded) setReady(true); }, [loaded]);
  return ready;
}

function RandomTablesPanel(): React.ReactElement {
  const { app } = useAtlasUI();
  const collectionId = useMapCollectionId();
  const mapPath = useAtlasStore((s) => s.mapPath);
  const state = useAtlasStore((s) => s.lootRoller);
  const setOpen = useAtlasStore((s) => s.setLootRollerOpen);
  const update = useAtlasStore((s) => s.updateLootRoller);
  const showRoll = useAtlasStore((s) => s.showLootRoll);
  const windowVariants = useDialogWindowVariants();
  const [freshRollId, setFreshRollId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importCollection, setImportCollection] = useState<string | null>(null);
  const viewedCollection = useRef(collectionId);
  viewedCollection.current = collectionId;
  /** A table just written from a paste, rolled once it has been read. */
  const [pendingRoll, setPendingRoll] = useState<string | null>(null);

  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(state.position ?? topRight, {
    margin: MARGIN,
    onDragEnd: (settled) => update({ position: settled }),
  });
  const startResize = usePanelResize(panelRef, { min: MIN_SIZE, margin: MARGIN, onResizeEnd: (size) => update({ size }) });

  const library = useRandomTables(app, collectionId);
  const ready = useFirstLoad(library.loaded);
  const history = useLootHistory(app, collectionId);
  const disabledViews = useMemo(() => new Set(state.disabledViews), [state.disabledViews]);
  const excludedRarities = useMemo(() => new Set(state.excludedRarities), [state.excludedRarities]);
  const source = selectedSource(library, state.selected);
  const sourceRoll = useSourceRoll(source, library, { disabledViews, excludedRarities }, state.count);

  const roll = (): void => {
    if (!collectionId) return;
    const mapName = baseName(mapPath ?? '').replace(/\.atlasmap$/i, '');
    runInBackground(sourceRoll.roll(state.count, mapName).then((made) => {
      if (!made) return;
      showRoll(made);
      setFreshRollId(made.id);
      LootHistoryStore.forApp(app).add(collectionId, made);
    }), 'Rolling a random table', t('tables.rollFailed'));
  };

  // A pasted table rolls as soon as its note has been read and it is the one selected.
  useEffect(() => {
    if (!pendingRoll || source?.id !== pendingRoll || !sourceRoll.canRoll) return;
    setPendingRoll(null);
    roll();
  });

  const openImporter = (): void => {
    setImportCollection(collectionId);
  };

  const savePasted = async (note: PastedTableNote, journal: ImportSaveJournal): Promise<void> => {
    if (!importCollection) throw new Error('No destination collection');
    const [written] = await saveImportedTables(app, importCollection, [{ ...note, id: 0 }], journal);
    if (written && viewedCollection.current === importCollection) {
      const id = tableSourceId(written);
      update({ selected: id, pane: 'results' });
      setPendingRoll(id);
    }
  };

  const saveFileTables = async (notes: readonly ImportedTableNote[], journal: ImportSaveJournal): Promise<void> => {
    if (!importCollection) throw new Error('No destination collection');
    const written = await saveImportedTables(app, importCollection, notes, journal);
    if (written[0] && viewedCollection.current === importCollection) update({ selected: tableSourceId(written[0]), pane: 'results' });
  };

  const shownIds = usePlayerLootIds();
  // Stable, so the cards (memoised) render again only when their own roll changes.
  const cardHandlers = useMemo(() => ({
    onOpenSource: (draw: LootDraw): void => openNote(app, draw.notePath, draw.name),
    onOpenLink: (link: string): void => openLink(app, link),
    shownIds,
    onShowToPlayers: (draw: LootDraw): void => PlayerLootDisplay.get().toggle(draw),
    onOpenResult: (result: TableResult): void => openNote(app, result.notePath, result.source[0] ?? result.notePath),
    onCopyResult: (result: TableResult): void => {
      runInBackground(navigator.clipboard.writeText(resultMarkdown(result)).then(() => showNotice(t('tables.copied'))), 'Copying a result', t('tables.copyFailed'));
    },
  }), [app, shownIds]);

  const hasSources = librarySources(library).length > 0;
  const basesOff = !library.basesAvailable && library.items.tables.length === 0 && library.text.length === 0;

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-loot-roller${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y, ...state.size }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={t('loot.panel')}
    >
      <header className="atlas-loot-roller__header" onPointerDown={startDrag}>
        <GripHorizontal className="atlas-loot-roller__grip" />
        <span className="atlas-loot-roller__icon"><CoinIcon /></span>
        <h2 className="atlas-loot-roller__title">{t('loot.title')}</h2>
        <CloseButton onClick={() => setOpen(false)} aria-label={t('loot.close')} />
      </header>

      {collectionId && !ready ? (
        <TablesSkeleton />
      ) : !collectionId || !hasSources || basesOff ? (
        <LootEmptyState
          inCollection={collectionId !== null}
          basesOff={basesOff && hasSources}
          onNewTable={openImporter}
          onUseNote={() => setSettingsOpen(true)}
        />
      ) : (
        <div className="atlas-loot-roller__body">
          <LootRollerTutorials hasRarities={sourceRoll.rarityCounts.size > 0} rolled={freshRollId !== null} />
          <aside className="atlas-loot-roller__sidebar">
            <TablesSidebar
              library={library}
              selectedId={source?.id ?? null}
              onSelect={(selected) => update({ selected })}
              disabledViews={disabledViews}
              onDisabledViewsChange={(views) => update({ disabledViews: views })}
              onNewTable={openImporter}
              onRename={(found, name) => {
                if (collectionId) setTableLabel(app, collectionId, found, name);
              }}
              onRemove={(removed) => {
                if (!collectionId) return;
                if ('source' in removed) removeTableSource(app, collectionId, removed.source, tableName(removed));
                else removeLootBase(app, collectionId, removed.path, removed.name);
              }}
              onOpen={(path, name) => openNote(app, path, name)}
            />
          </aside>
          <div className="atlas-loot-roller__main">
            <div className="atlas-loot-rollbar">
              {source?.kind === 'table' ? (
                <TableSummary
                  found={source.table}
                  onNoRepeatsChange={(noRepeats) => { if (collectionId) setTableNoRepeats(app, collectionId, source.table.source, noRepeats); }}
                  onOpenNote={() => openNote(app, source.table.source.path, source.table.noteName)}
                />
              ) : (
                <RarityToggles
                  rarities={library.rarities}
                  rarityCounts={sourceRoll.rarityCounts}
                  excluded={excludedRarities}
                  onExcludedChange={(excluded) => update({ excludedRarities: excluded })}
                />
              )}
              <RollActions
                count={state.count}
                unit={sourceRoll.unit}
                onCountChange={(count) => update({ count })}
                rollLabel={sourceRoll.rollLabel}
                {...(sourceRoll.rollName !== undefined && { rollName: sourceRoll.rollName })}
                hint={sourceRoll.hint}
                disabled={!sourceRoll.canRoll}
                onRoll={roll}
              />
            </div>
            <LootPaneTabs
              pane={state.pane}
              historyCount={history.length}
              onSelect={(pane) => update({ pane })}
              onClearHistory={() => LootHistoryStore.forApp(app).clear(collectionId)}
            />
            <div className="atlas-loot-list">
              {state.pane === 'results' ? (
                <LootResults roll={state.lastRoll} fresh={state.lastRoll?.id === freshRollId} {...cardHandlers} />
              ) : (
                <LootHistory rolls={history} onRemove={(rollId) => LootHistoryStore.forApp(app).remove(collectionId, rollId)} {...cardHandlers} />
              )}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {importCollection && (
          <PasteTableDialog key="paste" folder={tablesFolder(importCollection)} onSave={savePasted} {...(FILE_TABLE_IMPORT_ENABLED ? { onImport: saveFileTables } : {})} onClose={() => setImportCollection(null)} />
        )}
        {settingsOpen && collectionId && (
          <CollectionSettingsModal
            isOpen
            collectionId={collectionId}
            initialTab="loot"
            onClose={() => setSettingsOpen(false)}
            onEditTemplate={(templateId, id) => { void openTemplateEditor(app, { templateId, collectionId: id }); }}
          />
        )}
      </AnimatePresence>

      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--right" onPointerDown={startResize('right')} />
      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--bottom" onPointerDown={startResize('bottom')} />
      <div className="atlas-loot-roller__resize atlas-loot-roller__resize--corner" onPointerDown={startResize('corner')} />
    </motion.section>
  );
}
