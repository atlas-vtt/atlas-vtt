import React, { useState, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasSettings } from '../../keyboard/useMapHotkeys';
import { useNumberEditing } from './useNumberEditing';
import { listedByCards, listedBySides, listedSides } from '../../initiative/sides';
import { playerTokensRevision, subscribePlayerTokens } from '../../characters/playerTokens';
import { useStartCombat } from './useStartCombat';
import { defeatedCombatants } from '../../initiative/defeated';
import { shownItems } from '../../initiative/listSegments';
import { trackerSegments } from '../../initiative/trackerSegments';
import { useInitiativeLayout } from '../../initiative/useInitiativeLayout';
import { useMapResources } from '../../resources/useMapResources';
import { useInitiativeTokenSync } from '../../initiative/useInitiativeTokenSync';
import { missingPartyEntries } from '../../initiative/party';
import { mapEnemyImage } from '../../initiative/mapParty';
import { useMapParty, usePartyEntrySync } from '../../initiative/useMapParty';
import { useMapCollectionId } from '../hooks/useMapCollectionId';
import { useThemeIvy } from '../hooks/useThemeIvy';
import { useListPresence, useLookMorph, useTurnFlash, useTurnMotion } from './useInitiativeMotion';
import type { Outward } from '../../initiative/motion/listPresence';
import { CollectionSettingsModal } from './CollectionSettingsModal';
import { useMapInitiativeRules } from '../../initiative/useMapInitiativeRules';
import { useInitiativeRolls } from '../../initiative/useInitiativeRolls';
import { useEditInitiativePopup } from './useEditInitiativePopup';
import { InitiativeCard } from './InitiativeCard';
import { useInitiativeCardMenu } from './useInitiativeCardMenu';
import { initiativeTrackerOptions } from './initiativeTrackerOptions';
import { DEFAULT_TURN_OPTIONS } from '../../initiative/turnOptions';
import { clearCombatants } from '../../initiative/offMapCombatants';
import { nextTokenlessEnemy } from '../../initiative/tokenlessEnemies';
import { DRAGGED_SIDE_ATTRIBUTE, InitiativeTrackerList } from './InitiativeTrackerList';
import { InitiativeTrackerHeader } from './InitiativeTrackerHeader';
import { InitiativeTurnControls } from './InitiativeTurnControls';
import { useTurnInView } from './useTurnInView';
import { useStatblockHoverPreview } from './StatblockHoverPreview';
import { InitiativeStatblockPreview, type PreviewedEntry } from './InitiativeStatblockPreview';
import { captureRollContext } from '../../tools/diceRollOrigins';
import { useRowDrag, type RowDrag } from '../hooks/useRowDrag';
import { useSidePile } from './useSidePile';
import { TURN_KEY_ATTRIBUTE } from '../../initiative/motion/turnMotion';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';
import '../../initiative/initiative-panel.scss';
import './initiative-tracker.scss';
import './initiative-tracker-compact.scss';

/**
 * Initiative Tracker Panel
 * Modern minimal design with floating cards. The GM chooses the combatants from the token menu;
 * the players' list (`PlayerInitiativePanel`) shows the same ones, without those whose token is hidden.
 * The collection's initiative rules decide whether they act in turn order or by sides. It stands at
 * the right edge, its controls floating above and below it while the pointer is near; the GM lets the list start at
 * the turn (`useInitiativeLayout`).
 */
/** The tracker stands at the right edge, and comes from and leaves towards it. */
const OUTWARD: Outward = [1, 0];

export const InitiativeTracker: React.FC = () => {
  const { app, view } = useAtlasUI();
  const settings = useAtlasSettings();
  const compact = settings?.showsCompactInitiative() ?? false;
  const { layout } = useInitiativeLayout();
  // The tracker stands at the right edge: popups and tooltips open to its left
  const inward = 'left';
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  // The Atlas VTT theme's ivy over its corners, as on the players' list
  useThemeIvy(app ?? undefined, root);

  // Store state
  const isOpen = useAtlasStore((s) => s.initiativeTrackerOpen);
  // It comes in and leaves as the players' list does, opened by its hotkey or command
  const { drawn, leaving } = useListPresence(isOpen, root, OUTWARD);
  // Switching the compact view on or off glides the tracker to its new size as its cards fade in anew
  useLookMorph(root, compact);
  const initiative = useAtlasStore((s) => s.initiative);
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const mapPath = useAtlasStore((s) => s.mapPath);
  const mapLoaded = useAtlasStore((s) => s.mapLoaded);
  const isMapLoading = useAtlasStore((s) => s.isMapLoading);
  const rules = useMapInitiativeRules();
  const { roll, rolling } = useInitiativeRolls(app, rules);
  // The players at the table, from the collection's party
  const party = useMapParty();
  const collectionId = useMapCollectionId();
  const [partySettingsOpen, setPartySettingsOpen] = useState(false);
  const bySides = listedBySides(initiative, rules);
  const byCards = listedByCards(initiative, rules);
  const sides = useMemo(() => listedSides(initiative, rules), [initiative, rules]);
  // A token's side also follows the library and the played campaign's players (`sideOf`)
  const playerTokens = useSyncExternalStore(subscribePlayerTokens, playerTokensRevision, playerTokensRevision);

  // Store actions
  const nextTurn = useAtlasStore((s) => s.nextTurn);
  const previousTurn = useAtlasStore((s) => s.previousTurn);
  const reorderInitiative = useAtlasStore((s) => s.reorderInitiative);
  const setSideOrder = useAtlasStore((s) => s.setSideOrder);
  const endCombat = useAtlasStore((s) => s.endCombat);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);
  const addToInitiative = useAtlasStore((s) => s.addToInitiative);

  // Turns pass defeated combatants by, as their cards show them now
  const store = useViewStoreHook();
  const definitions = useMapResources();
  const defeated = useCallback((): ReadonlySet<string> => {
    const { initiative: current, objects } = store.getState();
    return defeatedCombatants(current.entries, objects.tokens, definitions);
  }, [store, definitions]);
  const startCombat = useStartCombat(rules, defeated);

  const { open: openEditPopup, popup: editPopup } = useEditInitiativePopup(updateInitiativeEntry, inward);

  // Use shared statblock hover preview hook
  const [previewState, previewActions] = useStatblockHoverPreview<PreviewedEntry>({ app });

  useInitiativeTokenSync(tokens, initiative.entries);
  usePartyEntrySync(party, initiative.entries);
  // The players at the table who are not in the fight yet
  const missingParty = missingPartyEntries(party, initiative.entries);

  // Sorted entries by order
  const sortedEntries = useMemo(() => {
    return [...initiative.entries].sort((a, b) => a.order - b.order);
  }, [initiative.entries]);

  // The list as it is drawn: from the turn on where the GM chose so
  const segments = useMemo(
    () => trackerSegments(sortedEntries, tokens, {
      bySides, sides, fightRuns: initiative.isActive, round: initiative.round,
      fromTurn: layout.fromTurn,
    }),
    [sortedEntries, tokens, bySides, sides, initiative.isActive, initiative.round, layout.fromTurn, playerTokens],
  );
  const shownOrder = useMemo(() => shownItems(segments), [segments]);
  const shownPlaceOf = useMemo(() => new Map(shownOrder.map((entry, index) => [entry.id, index])), [shownOrder]);
  // A drag reorders by a card's place among all combatants, whatever place the list shows it at
  const placeOf = useMemo(() => new Map(sortedEntries.map((entry, index) => [entry.id, index])), [sortedEntries]);

  // The turn stays in view as it moves
  const contentRef = useRef<HTMLDivElement>(null);
  const turnOf = initiative.sides?.active ?? initiative.entries.find((entry) => entry.isActive)?.id;
  useTurnInView(contentRef, { fightRuns: initiative.isActive, turnOf, round: initiative.round, fromTurn: layout.fromTurn });
  // The cards glide as the turn passes on or back, and who holds it lights up, as on the players' list
  useTurnMotion(store, contentRef);
  const turnFlash = useTurnFlash(initiative);

  // Cards are dragged as a phone's home screen is edited (`useRowDrag`), each within its group (a side, the delayed,
  // this round or the next): the dragged card takes the place of the one it lands on
  const drag = useRowDrag(
    () => [...(contentRef.current?.querySelectorAll(`.atlas-initiative-card[${TURN_KEY_ATTRIBUTE}]`) ?? [])],
    (from, to) => {
      const moved = placeOf.get(shownOrder[from]?.id ?? '');
      const target = placeOf.get(shownOrder[to]?.id ?? '');
      if (moved !== undefined && target !== undefined) reorderInitiative(moved, target);
    },
    { axis: 'vertical', scroller: () => contentRef.current },
  );

  // Before a fight the GM drags a side by its heading to choose who acts first; the fight starts in that order. The
  // dragged side takes the place of the one it lands on among all the sides, also those the list leaves out.
  const arrangesSides = bySides && !initiative.isActive && sides.length > 1;
  const drawnSides = useMemo(() => segments.flatMap((segment) => (segment.kind === 'group' && segment.side ? [segment.side.id] : [])), [segments]);
  const sideDrag = useRowDrag(
    () => [...(contentRef.current?.querySelectorAll(`[${DRAGGED_SIDE_ATTRIBUTE}]`) ?? [])],
    (from, to) => {
      const moved = drawnSides[from];
      const target = drawnSides[to];
      if (moved === undefined || target === undefined) return;
      const order = sides.map((side) => side.id).filter((id) => id !== moved);
      order.splice(order.indexOf(target) + (from < to ? 1 : 0), 0, moved);
      setSideOrder(order);
    },
    { axis: 'vertical', scroller: () => contentRef.current },
  );
  // Held, a side's cards pile up behind its first, so a long side is carried like one card
  const pile = useSidePile(sideDrag.held !== null);
  const sideOf = (event: React.PointerEvent<HTMLElement>): HTMLElement | null => event.currentTarget.closest<HTMLElement>(`[${DRAGGED_SIDE_ATTRIBUTE}]`);
  const pilingDrag: RowDrag = {
    ...sideDrag,
    onPointerDown: (index, event) => {
      if (event.button === 0) pile(sideOf(event));
      sideDrag.onPointerDown(index, event);
    },
    onPointerUp: (event) => {
      pile(sideOf(event));
      sideDrag.onPointerUp(event);
    },
  };
  const settling = drag.settling || sideDrag.settling;

  // Numbers typed on the cards; Tab goes on down the list as it shows
  const numberEditing = useNumberEditing(shownOrder, updateInitiativeEntry);

  // The card menu's Preview row: the statblock Mod shows over the card, kept until a press outside it.
  const { holdPreview } = previewActions;
  const previewFromMenu = useCallback((entry: InitiativeEntry, cardElement: HTMLElement): void => {
    if (!entry.statblockPath) return;
    const originContext = captureRollContext(view?.viewId, { mapPath, mapLoaded, isMapLoading, objects: { tokens } }, entry.tokenId !== undefined ? [entry.tokenId] : []);
    holdPreview({ entry, originContext }, entry.statblockPath, cardElement);
  }, [holdPreview, view, mapPath, mapLoaded, isMapLoading, tokens]);

  const handleContextMenu = useInitiativeCardMenu({ tokens, bySides, sides, cards: initiative.cards !== undefined, fightRuns: initiative.isActive, roll, defeated, edit: openEditPopup, preview: previewFromMenu });

  const openOptions = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const entries = initiativeTrackerOptions(
      { empty: initiative.entries.length === 0, compact,
        // Adds the players at the table; with none to add, opens the collection's party to set it up
        party: collectionId === null ? null : {
          label: party.length === 0 ? t('initiative.partySetUp') : missingParty.length > 0 ? t('initiative.partyAdd') : t('initiative.partyEdit'),
          onClick: () => (missingParty.length > 0 ? missingParty.forEach((entry) => addToInitiative(entry)) : setPartySettingsOpen(true)),
        },
        banner: (settings?.initiativeTurnOptions() ?? DEFAULT_TURN_OPTIONS).banner },
      {
        setCompact: (on) => settings?.setCompactInitiative(on),
        setBanner: (banner) => settings?.setInitiativeTurnOptions({ banner }),
        clear: () => clearCombatants(store),
        resetNumbers: () => store.getState().resetInitiativeNumbers(),
        addEnemy: () => addToInitiative(nextTokenlessEnemy(store.getState().initiative.entries, app ? mapEnemyImage(app, store.getState().mapPath) : '')),
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
      const originContext = captureRollContext(view?.viewId, { mapPath, mapLoaded, isMapLoading, objects: { tokens } }, entry.tokenId !== undefined ? [entry.tokenId] : []);
      previewActions.showPreview({ entry, originContext }, entry.statblockPath, cardElement);
    },
    [previewActions, view, mapPath, mapLoaded, isMapLoading, tokens]
  );

  // Not drawn once closed and gone
  if (!drawn) return null;

  const card = (entry: InitiativeEntry, group: string, inTurn = false): React.ReactElement => (
    <InitiativeCard
      key={entry.id}
      entry={entry}
      place={shownPlaceOf.get(entry.id) ?? 0}
      group={group}
      drag={drag}
      bySides={bySides}
      byCards={byCards}
      showName={compact}
      compact={compact}
      tooltipSide={inward}
      isEditingNumber={numberEditing.editingId === entry.id}
      onStartNumberEdit={numberEditing.start}
      onCommitNumber={numberEditing.commit}
      onCancelNumberEdit={numberEditing.cancel}
      isHoveredForPreview={previewState.hoveredEntry?.entry.id === entry.id}
      onContextMenu={handleContextMenu}
      onHover={handleEntryHover}
      turnFlash={turnFlash && (bySides ? inTurn && !entry.sitsOut : entry.isActive && !entry.delayed)}
    />
  );

  const trackerClasses = [
    'atlas-initiative-panel atlas-initiative-tracker',
    // The compact list is all names
    compact && 'atlas-initiative-tracker--named atlas-initiative-tracker--compact',
    leaving && 'atlas-initiative-tracker--leaving',
  ].filter(Boolean).join(' ');

  return (
    <div ref={setRoot} className={trackerClasses}>
      {/* Its surface is a layer of its own, so the theme's ivy can lie behind it; near it, its bars show */}
      <div className="atlas-initiative-panel__surface" aria-hidden="true" />
      <div className="atlas-initiative-tracker__reach" aria-hidden="true" />
      {/* Nothing is rolled where the sides take turns or cards are dealt */}
      <InitiativeTrackerHeader
        rolls={!bySides && !byCards}
        fightRuns={initiative.isActive}
        empty={sortedEntries.length === 0}
        rolling={rolling}
        onRoll={() => roll()}
        onStart={startCombat}
        onEnd={endCombat}
        onOptions={openOptions}
      />

      {/* The combatants, in the order the list shows them */}
      <div
        ref={contentRef}
        className={['atlas-initiative-panel__list', drag.held !== null && 'atlas-initiative-tracker__list--dragging', sideDrag.held !== null && 'atlas-initiative-tracker__list--dragging-sides', settling && 'atlas-initiative-tracker__list--settling', arrangesSides && 'atlas-initiative-tracker__list--arranges-sides'].filter(Boolean).join(' ')}
        // The cards' art is images, which the browser would drag as files and cancel the pointer for
        onDragStart={(event) => event.preventDefault()}
      >
        {/* Empty, the panel keeps the size it has with one combatant: an unseen card of the view's shape holds it */}
        {sortedEntries.length === 0 && (
          <div className={`atlas-initiative-card${compact ? '' : ' atlas-initiative-card--tile'} atlas-initiative-card--placeholder`} aria-hidden="true" />
        )}
        {sortedEntries.length > 0 && <InitiativeTrackerList segments={segments} card={card} {...(arrangesSides && { sideDrag: pilingDrag })} />}
      </div>

      {/* The shade over the list's top, shown once it is scrolled */}
      <div className="atlas-initiative-panel__top-shade" aria-hidden="true" />

      {/* The round at the list's foot, as the players' list shows it; without one, a shade there while more lies below */}
      {initiative.isActive
        ? <div className="atlas-initiative-panel__round">{t('playerInit.round', { round: initiative.round })}</div>
        : <div className="atlas-initiative-panel__bottom-shade" aria-hidden="true" />}

      <InitiativeStatblockPreview app={app} state={previewState} tokens={tokens} side={inward} />

      {initiative.isActive && (
        <InitiativeTurnControls
          tooltipSide={inward}
          onPrevious={() => previousTurn(defeated())}
          onNext={() => nextTurn(defeated())}
        />
      )}

      {partySettingsOpen && collectionId !== null && (
        <CollectionSettingsModal isOpen collectionId={collectionId} initialTab="party" onClose={() => setPartySettingsOpen(false)} />
      )}

      {editPopup}
    </div>
  );
};
