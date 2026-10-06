import React, { useState, useCallback, useMemo, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { openContextMenuGlobal } from '../root/ContextMenuContext';
import {
  Dices,
  Swords,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useAtlasStore } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { SIDE_LABELS, listedBySides, sideOf, sidesInOrder } from '../../initiative/sides';
import { useInitiativeTokenSync } from '../../initiative/useInitiativeTokenSync';
import { useMapInitiativeRules } from '../../initiative/useMapInitiativeRules';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { scrollWithin } from '../../utils/scrollWithin';
import { EditInitiativePopup } from './EditInitiativePopup';
import { InitiativeCard } from './InitiativeCard';
import { initiativeCardMenu } from './initiativeCardMenu';
import { EndCombatIcon } from './EndCombatIcon';
import { useStatblockHoverPreview } from './StatblockHoverPreview';
import { InitiativeStatblockPreview, type PreviewedEntry } from './InitiativeStatblockPreview';
import { captureRollContext } from '../../tools/diceRollOrigins';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import './initiative-tracker.scss';

/**
 * Initiative Tracker Panel
 * Modern minimal design with floating cards. The GM chooses the combatants from the token menu;
 * the players' list (`PlayerInitiativePanel`) shows the same ones, without those whose token is hidden.
 * The collection's initiative rules decide whether they act in turn order or by sides.
 */
export const InitiativeTracker: React.FC = () => {
  const { app, view } = useAtlasUI();

  // Store state
  const isOpen = useAtlasStore((s) => s.initiativeTrackerOpen);
  const initiative = useAtlasStore((s) => s.initiative);
  const tokens = useAtlasStore((s) => s.objects?.tokens) || {};
  const mapPath = useAtlasStore((s) => s.mapPath);
  const mapLoaded = useAtlasStore((s) => s.mapLoaded);
  const isMapLoading = useAtlasStore((s) => s.isMapLoading);
  const rules = useMapInitiativeRules();
  const bySides = listedBySides(initiative, rules);
  const firstSide = initiative.sides?.first ?? rules.firstSide;

  // Store actions
  const removeFromInitiative = useAtlasStore((s) => s.removeFromInitiative);
  const rollAllInitiative = useAtlasStore((s) => s.rollAllInitiative);
  const rollEntryInitiative = useAtlasStore((s) => s.rollEntryInitiative);
  const nextTurn = useAtlasStore((s) => s.nextTurn);
  const previousTurn = useAtlasStore((s) => s.previousTurn);
  const reorderInitiative = useAtlasStore((s) => s.reorderInitiative);
  const moveToFront = useAtlasStore((s) => s.moveToFront);
  const moveToBack = useAtlasStore((s) => s.moveToBack);
  const startCombat = useAtlasStore((s) => s.startCombat);
  const endCombat = useAtlasStore((s) => s.endCombat);
  const updateInitiativeEntry = useAtlasStore((s) => s.updateInitiativeEntry);
  const updateTokens = useAtlasStore((s) => s.updateTokens);
  const setInitiativeSitsOut = useAtlasStore((s) => s.setInitiativeSitsOut);
  const resetInitiative = useAtlasStore((s) => s.resetInitiative);

  // Local state
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hotkeyPressed, setHotkeyPressed] = useState<'prev' | 'next' | null>(null);
  const [editingEntry, setEditingEntry] = useState<InitiativeEntry | null>(null);
  const [editAnchorRect, setEditAnchorRect] = useState<DOMRect | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const sideLabelId = useId();

  // The turn stays in view in a list longer than the panel: the combatant's card, or the top of its side
  const contentRef = useRef<HTMLDivElement>(null);
  const turnOf = initiative.sides?.active ?? initiative.entries.find((entry) => entry.isActive)?.id;
  useEffect(() => {
    const content = contentRef.current;
    if (!initiative.isActive || !content) return;
    const side = content.querySelector('.atlas-initiative-side--active');
    const card = content.querySelector('.atlas-initiative-card--active');
    if (side) scrollWithin(content, side, 'start');
    else if (card) scrollWithin(content, card, 'nearest');
  }, [initiative.isActive, turnOf, initiative.round]);

  // Refs for turn navigation buttons
  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  // Use shared statblock hover preview hook
  const [previewState, previewActions] = useStatblockHoverPreview<PreviewedEntry>({ app });

  // Listen for hotkey events to provide visual feedback
  useEffect(() => {
    const handleHotkey = (e: CustomEvent<'prev' | 'next'>): void => {
      setHotkeyPressed(e.detail);
      // Clear after animation duration
      window.setTimeout(() => setHotkeyPressed(null), 150);
    };

    window.addEventListener('atlas-initiative-hotkey', handleHotkey as EventListener);
    return () => window.removeEventListener('atlas-initiative-hotkey', handleHotkey as EventListener);
  }, []);

  useInitiativeTokenSync(tokens, initiative.entries);

  // Sorted entries by order
  const sortedEntries = useMemo(() => {
    return [...initiative.entries].sort((a, b) => a.order - b.order);
  }, [initiative.entries]);

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

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: InitiativeEntry, cardElement: HTMLElement): void => {
      const entries = initiativeCardMenu(entry, tokens[entry.tokenId], { bySides, fightRuns: initiative.isActive }, {
        roll: () => rollEntryInitiative(entry.id, rules.roll),
        moveToFront: () => moveToFront(entry.id),
        moveToBack: () => moveToBack(entry.id),
        edit: () => {
          setEditingEntry(entry);
          setEditAnchorRect(cardElement.getBoundingClientRect());
          setEditValue(String(entry.initiative));
        },
        updateToken: (changes) => updateTokens([{ id: entry.tokenId, changes }]),
        setSitsOut: (sitsOut) => setInitiativeSitsOut(entry.id, sitsOut),
        remove: () => removeFromInitiative(entry.id),
      });

      openContextMenuGlobal(entries, { x: e.clientX, y: e.clientY });
    },
    [tokens, bySides, initiative.isActive, rules.roll, rollEntryInitiative, moveToFront, moveToBack, removeFromInitiative, updateTokens, setInitiativeSitsOut]
  );

  // Hover handler for statblock preview (CMD+hover)
  // Preview stays open while CMD is held - only CMD release closes it
  const handleEntryHover = useCallback(
    (entry: InitiativeEntry | null, cardElement?: HTMLElement): void => {
      // Ignore null entries - only CMD release closes the preview
      if (!entry || !entry.statblockPath) {
        return;
      }

      // The scene this list was drawn from goes with the preview, whatever loads while it stays open
      const originContext = captureRollContext(view?.viewId, { mapPath, mapLoaded, isMapLoading, objects: { tokens } }, [entry.tokenId]);
      previewActions.showPreview({ entry, originContext }, entry.statblockPath, cardElement);
    },
    [previewActions, view, mapPath, mapLoaded, isMapLoading, tokens]
  );

  // Don't render if closed
  if (!isOpen) return null;

  // `index` is the card's place among all combatants, which is what a drag reorders
  const card = (entry: InitiativeEntry, index: number): React.ReactElement => (
    <InitiativeCard
      key={entry.id}
      entry={entry}
      index={index}
      bySides={bySides}
      isHoveredForPreview={previewState.hoveredEntry?.entry.id === entry.id}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onHover={handleEntryHover}
    />
  );

  return (
    <div className="atlas-initiative-tracker">
      {/* Controls row: Roll + Combat + Clear */}
      <div className="atlas-initiative-tracker__controls">
        {/* Nothing is rolled where the sides take turns */}
        {!bySides && (
          <LabelTooltip label="Roll initiative">
            <button
              className="clickable-icon atlas-initiative-tracker__btn"
              onClick={() => rollAllInitiative(rules.roll)}
              disabled={sortedEntries.length === 0}
            >
              <Dices />
            </button>
          </LabelTooltip>
        )}

        {!initiative.isActive ? (
          <LabelTooltip label="Start combat">
            <button
              className="clickable-icon atlas-initiative-tracker__btn"
              onClick={() => startCombat(rules)}
              disabled={sortedEntries.length === 0}
            >
              <Swords />
            </button>
          </LabelTooltip>
        ) : (
          <LabelTooltip label="End combat">
            <button
              className="clickable-icon atlas-initiative-tracker__btn atlas-initiative-tracker__btn--end"
              onClick={endCombat}
            >
              <EndCombatIcon />
            </button>
          </LabelTooltip>
        )}

        <LabelTooltip label="Clear initiative">
          <button
            className="clickable-icon atlas-initiative-tracker__btn"
            onClick={resetInitiative}
            disabled={sortedEntries.length === 0}
          >
            <Trash2 />
          </button>
        </LabelTooltip>
      </div>

      {/* Content - Cards for each combatant */}
      <div ref={contentRef} className="atlas-initiative-tracker__content">
        {sortedEntries.length === 0 && (
          <p className="atlas-initiative-tracker__empty">Right-click a token to add it</p>
        )}
        {sortedEntries.length > 0 && (bySides
          ? sidesInOrder(firstSide).map((side) => (
            <section
              key={side}
              className={`atlas-initiative-side ${initiative.sides?.active === side ? 'atlas-initiative-side--active' : ''}`}
              aria-labelledby={`${sideLabelId}-${side}`}
              aria-current={initiative.sides?.active === side || undefined}
            >
              <h4 id={`${sideLabelId}-${side}`} className="atlas-initiative-side__label">{SIDE_LABELS[side]}</h4>
              {sortedEntries.map((entry, index) => sideOf(tokens[entry.tokenId]) === side && card(entry, index))}
            </section>
          ))
          : sortedEntries.map(card))}
      </div>

      <InitiativeStatblockPreview app={app} state={previewState} tokens={tokens} />

      {/* Turn navigation — always visible, disabled when combat inactive */}
      <div className="atlas-initiative-tracker__turn-controls">
        <button
          ref={prevBtnRef}
          className={`clickable-icon atlas-initiative-tracker__btn ${hotkeyPressed === 'prev' ? 'atlas-initiative-tracker__btn--pressed' : ''}`}
          onClick={previousTurn}
          disabled={!initiative.isActive}
        >
          <ChevronUp />
        </button>
        <span className="atlas-initiative-tracker__round">
          {initiative.isActive ? `R${initiative.round}` : '—'}
        </span>
        <button
          ref={nextBtnRef}
          className={`clickable-icon atlas-initiative-tracker__btn ${hotkeyPressed === 'next' ? 'atlas-initiative-tracker__btn--pressed' : ''}`}
          onClick={nextTurn}
          disabled={!initiative.isActive}
        >
          <ChevronDown />
        </button>
      </div>

      {/* Edit Initiative Popup - positioned like statblock preview */}
      {editingEntry && editAnchorRect && createPortal(
        <EditInitiativePopup
          entry={editingEntry}
          anchorRect={editAnchorRect}
          value={editValue}
          onChange={setEditValue}
          onConfirm={() => {
            const parsed = parseInt(editValue, 10);
            if (!isNaN(parsed)) {
              updateInitiativeEntry(editingEntry.id, { initiative: parsed });
            }
            setEditingEntry(null);
            setEditAnchorRect(null);
          }}
          onCancel={() => {
            setEditingEntry(null);
            setEditAnchorRect(null);
          }}
        />,
        document.body
      )}
    </div>
  );
};
