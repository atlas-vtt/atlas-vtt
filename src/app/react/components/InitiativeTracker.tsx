import React, { useState, useCallback, useMemo, useRef } from 'react';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasSettings } from '../../keyboard/useMapHotkeys';
import { useNumberEditing } from './useNumberEditing';
import { listedByCards, listedBySides, listedSides } from '../../initiative/sides';
import { useStartCombat } from './useStartCombat';
import { defeatedCombatants } from '../../initiative/defeated';
import { shownItems } from '../../initiative/listSegments';
import { trackerSegments } from '../../initiative/trackerSegments';
import { useInitiativeLayout } from '../../initiative/useInitiativeLayout';
import { useMapResources } from '../../resources/useMapResources';
import { useInitiativeTokenSync } from '../../initiative/useInitiativeTokenSync';
import { useMapInitiativeRules } from '../../initiative/useMapInitiativeRules';
import { useInitiativeRolls } from '../../initiative/useInitiativeRolls';
import { useEditInitiativePopup } from './useEditInitiativePopup';
import { InitiativeCard } from './InitiativeCard';
import { useInitiativeCardMenu } from './useInitiativeCardMenu';
import { initiativeTrackerOptions } from './initiativeTrackerOptions';
import { DEFAULT_TURN_OPTIONS } from '../../initiative/turnOptions';
import { clearCombatants } from '../../initiative/offMapCombatants';
import { InitiativeTrackerList } from './InitiativeTrackerList';
import { InitiativeTrackerHeader } from './InitiativeTrackerHeader';
import { InitiativeTurnControls } from './InitiativeTurnControls';
import { useTurnInView } from './useTurnInView';
import { useStatblockHoverPreview } from './StatblockHoverPreview';
import { InitiativeStatblockPreview, type PreviewedEntry } from './InitiativeStatblockPreview';
import { captureRollContext } from '../../tools/diceRollOrigins';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';
import './initiative-tracker.scss';

/**
 * Initiative Tracker Panel
 * Modern minimal design with floating cards. The GM chooses the combatants from the token menu;
 * the players' list (`PlayerInitiativePanel`) shows the same ones, without those whose token is hidden.
 * The collection's initiative rules decide whether they act in turn order or by sides. The GM
 * docks it at either edge, lets the list start at the turn and collapses it to the next combatants
 * (`useInitiativeLayout`).
 */
export const InitiativeTracker: React.FC = () => {
  const { app, view } = useAtlasUI();
  const settings = useAtlasSettings();
  const showNames = settings?.showsInitiativeNames() ?? false;
  const { layout, setLayout } = useInitiativeLayout();
  // Popups and tooltips open away from the edge the tracker stands at
  const inward = layout.dock === 'left' ? 'right' : 'left';

  // Store state
  const isOpen = useAtlasStore((s) => s.initiativeTrackerOpen);
  // The dice log opens at the left edge: a tracker docked there moves beside it
  const diceLogOpen = useAtlasStore((s) => s.isDiceLogOpen);
  const initiative = useAtlasStore((s) => s.initiative);
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const mapPath = useAtlasStore((s) => s.mapPath);
  const mapLoaded = useAtlasStore((s) => s.mapLoaded);
  const isMapLoading = useAtlasStore((s) => s.isMapLoading);
  const rules = useMapInitiativeRules();
  const { roll, rolling } = useInitiativeRolls(app, rules);
  const bySides = listedBySides(initiative, rules);
  const byCards = listedByCards(initiative, rules);
  const sides = useMemo(() => listedSides(initiative, rules), [initiative, rules]);

  // Store actions
  const nextTurn = useAtlasStore((s) => s.nextTurn);
  const previousTurn = useAtlasStore((s) => s.previousTurn);
  const reorderInitiative = useAtlasStore((s) => s.reorderInitiative);
  const endCombat = useAtlasStore((s) => s.endCombat);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);
  const openAssetManager = useAtlasStore((s) => s.openAssetManager);
  const setInitiativeConfig = useAtlasStore((s) => s.setInitiativeConfig);

  // Turns pass defeated combatants by, as their cards show them now
  const store = useViewStoreHook();
  const definitions = useMapResources();
  const defeated = useCallback((): ReadonlySet<string> => {
    const { initiative: current, objects } = store.getState();
    return defeatedCombatants(current.entries, objects.tokens, definitions);
  }, [store, definitions]);
  const startCombat = useStartCombat(rules, defeated);

  // Local state
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { open: openEditPopup, popup: editPopup } = useEditInitiativePopup(updateInitiativeEntry, inward);

  // Use shared statblock hover preview hook
  const [previewState, previewActions] = useStatblockHoverPreview<PreviewedEntry>({ app });

  useInitiativeTokenSync(tokens, initiative.entries);

  // Sorted entries by order
  const sortedEntries = useMemo(() => {
    return [...initiative.entries].sort((a, b) => a.order - b.order);
  }, [initiative.entries]);

  // The list as it is drawn: from the turn on where the GM chose so, only the next ones while collapsed
  const segments = useMemo(
    () => trackerSegments(sortedEntries, tokens, {
      bySides, sides, fightRuns: initiative.isActive, round: initiative.round,
      fromTurn: layout.fromTurn, collapsed: layout.collapsed,
    }),
    [sortedEntries, tokens, bySides, sides, initiative.isActive, initiative.round, layout.fromTurn, layout.collapsed],
  );
  const shownOrder = useMemo(() => shownItems(segments), [segments]);
  // A drag reorders by a card's place among all combatants, whatever place the list shows it at
  const placeOf = useMemo(() => new Map(sortedEntries.map((entry, index) => [entry.id, index])), [sortedEntries]);

  // The turn stays in view as it moves
  const contentRef = useRef<HTMLDivElement>(null);
  const turnOf = initiative.sides?.active ?? initiative.entries.find((entry) => entry.isActive)?.id;
  useTurnInView(contentRef, { fightRuns: initiative.isActive, turnOf, round: initiative.round, fromTurn: layout.fromTurn || layout.collapsed });

  // Numbers typed on the cards; Tab goes on down the list as it shows
  const numberEditing = useNumberEditing(shownOrder, updateInitiativeEntry);

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number): void => {
    setDragFromIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number): void => {
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback((): void => {
    if (dragFromIndex !== null && dragOverIndex !== null && dragFromIndex !== dragOverIndex) {
      reorderInitiative(dragFromIndex, dragOverIndex);
    }
    setDragFromIndex(null);
    setDragOverIndex(null);
  }, [dragFromIndex, dragOverIndex, reorderInitiative]);

  const handleContextMenu = useInitiativeCardMenu({ tokens, bySides, sides, cards: initiative.cards !== undefined, fightRuns: initiative.isActive, roll, defeated, edit: openEditPopup });

  const openOptions = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const entries = initiativeTrackerOptions(
      // Cards keep the order they were dealt in, so the Auto sort switch is disabled there as by sides
      { autoSort: initiative.config.autoSort, bySides: bySides || byCards, empty: initiative.entries.length === 0, showNames, fromTurn: layout.fromTurn, dock: layout.dock,
        turn: settings?.initiativeTurnOptions() ?? DEFAULT_TURN_OPTIONS, online: settings?.isExperimentalOn('onlinePlay') ?? false },
      {
        setAutoSort: (autoSort) => setInitiativeConfig({ autoSort }),
        setShowNames: (on) => settings?.setInitiativeNames(on),
        setFromTurn: (fromTurn) => setLayout({ fromTurn }),
        setDock: (dock) => setLayout({ dock }),
        setTurn: (changes) => settings?.setInitiativeTurnOptions(changes),
        clear: () => clearCombatants(store),
        addCombatant: () => openAssetManager('tokens'),
      },
    );
    openContextMenuGlobal(entries, { x: rect.left, y: rect.bottom }, { returnFocus: button, doc: button.ownerDocument });
  };

  // Hover handler for statblock preview (Mod+hover): it lives while Mod is held, and a card left without Mod ends it
  const handleEntryHover = useCallback(
    (entry: InitiativeEntry | null, cardElement?: HTMLElement): void => {
      if (!entry) {
        previewActions.closePreview();
        return;
      }
      if (!entry.statblockPath) return;

      // The scene this list was drawn from goes with the preview, whatever loads while it stays open
      const originContext = captureRollContext(view?.viewId, { mapPath, mapLoaded, isMapLoading, objects: { tokens } }, [entry.tokenId]);
      previewActions.showPreview({ entry, originContext }, entry.statblockPath, cardElement);
    },
    [previewActions, view, mapPath, mapLoaded, isMapLoading, tokens]
  );

  // Don't render if closed
  if (!isOpen) return null;

  const card = (entry: InitiativeEntry): React.ReactElement => (
    <InitiativeCard
      key={entry.id}
      entry={entry}
      index={placeOf.get(entry.id) ?? 0}
      bySides={bySides}
      byCards={byCards}
      showName={showNames}
      tooltipSide={inward}
      isEditingNumber={numberEditing.editingId === entry.id}
      onStartNumberEdit={numberEditing.start}
      onCommitNumber={numberEditing.commit}
      onCancelNumberEdit={numberEditing.cancel}
      isHoveredForPreview={previewState.hoveredEntry?.entry.id === entry.id}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onHover={handleEntryHover}
    />
  );

  const trackerClasses = [
    'atlas-initiative-tracker',
    showNames && 'atlas-initiative-tracker--named',
    layout.dock === 'left' && 'atlas-initiative-tracker--left',
    layout.dock === 'left' && diceLogOpen && 'atlas-initiative-tracker--beside-log',
    layout.collapsed && 'atlas-initiative-tracker--collapsed',
  ].filter(Boolean).join(' ');

  return (
    <div className={trackerClasses}>
      {/* Nothing is rolled where the sides take turns or cards are dealt */}
      <InitiativeTrackerHeader
        rolls={!bySides && !byCards}
        fightRuns={initiative.isActive}
        empty={sortedEntries.length === 0}
        rolling={rolling}
        collapsed={layout.collapsed}
        leftOut={sortedEntries.length - shownOrder.length}
        tooltipSide={inward}
        onRoll={() => roll()}
        onStart={startCombat}
        onEnd={endCombat}
        onOptions={openOptions}
        onToggleCollapsed={() => setLayout({ collapsed: !layout.collapsed })}
      />

      {/* The combatants, in the order the list shows them */}
      <div ref={contentRef} className="atlas-initiative-tracker__content">
        {sortedEntries.length === 0 && (
          <p className="atlas-initiative-tracker__empty">{t('initiative.empty')}</p>
        )}
        {sortedEntries.length > 0 && <InitiativeTrackerList segments={segments} card={card} />}
      </div>

      <InitiativeStatblockPreview app={app} state={previewState} tokens={tokens} side={inward} />

      <InitiativeTurnControls
        fightRuns={initiative.isActive}
        round={initiative.round}
        tooltipSide={inward}
        onPrevious={() => previousTurn(defeated())}
        onNext={() => nextTurn(defeated())}
      />

      {editPopup}
    </div>
  );
};
