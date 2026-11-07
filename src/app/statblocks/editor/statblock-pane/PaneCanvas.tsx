import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import type { StatblockTemplate } from '../../model/templateTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { readField, type FieldRecord } from '../../values/fieldValues';
import { foldedBlocks } from '../../render/foldRule';
import { FoldedChips } from '../panel-frame/FoldedChips';
import { PanelCard } from '../panel-frame/PanelFrame';
import type { PaneServices } from '../paneServices';
import { PaneEditContext } from './paneEditContext';
import type { PendingCommit } from './paneTypes';
import { usePaneEditor } from './usePaneEditor';
import { PaneRecoveryContext, usePaneRecovery } from './usePaneRecovery';
import { usePaneCharacterValues } from './usePaneCharacterValues';
import { holdTypingFocus } from './typingFocus';

export interface PaneCanvasProps {
  app: App;
  services: PaneServices;
  notePath: string;
  /** The pane's collection, whose tokens the token socket links. */
  collectionId: string | null;
  template: StatblockTemplate;
  /** The template's name: `data-template` on the card. */
  templateName: string;
  record: FieldRecord;
  writable: boolean;
  pendingCommit: PendingCommit;
  /** Raised to move focus to the first empty value (a statblock just created); 0 never does. */
  focusRequest: number;
  /**
   * The last request acted on, kept by the pane across notes: the canvas is
   * made anew for each note, and a view turning to another note must not move focus.
   */
  handledFocusRequest: React.RefObject<number>;
  onExit: (step: 1 | -1) => void;
  onWriteProblem: (problem: string | null) => void;
  /** Says something in the pane's live region. */
  announce: (text: string) => void;
  /** The card's ⋯, in its top-right corner. */
  cardMenu?: React.ReactNode;
  /** Shown under the card, with the card's editing at hand: the tray. */
  children?: React.ReactNode;
}

/**
 * The runtime card in the editing mode (§7.2, §7.11): empty fields show their
 * prompts, and the pane's chrome and inputs come in through the renderer's
 * seams, so the card is drawn by the same code the map and the DM screen use.
 */
export function PaneCanvas(props: PaneCanvasProps): React.JSX.Element {
  const { app, notePath, template, templateName, record, focusRequest, handledFocusRequest, writable } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  // Sections unfolded on this card stay open for its life, empty or not (§8.2): no focus decides it.
  const [unfolded, setUnfoldedIds] = useState<ReadonlySet<string>>(() => new Set());
  const folded = useMemo(() => (writable ? foldedBlocks(template, record, unfolded) : []), [writable, template, record, unfolded]);
  const opening = useRef<string | null>(null);
  const setUnfolded = useCallback((blockId: string, open: boolean): void => {
    if (open) opening.current = blockId;
    setUnfoldedIds((now) => {
      if (now.has(blockId) === open) return now;
      const next = new Set(now);
      if (open) next.add(blockId);
      else next.delete(blockId);
      return next;
    });
  }, []);
  const editor = usePaneEditor({ ...props, cardRef, folded, setUnfolded });
  const recovery = usePaneRecovery(app, notePath, template);
  const character = usePaneCharacterValues(app, notePath, template, record);
  const { spots } = editor.controller;

  // A chip unfolds its section with focus in its first value ("Add spell").
  useEffect(() => {
    const blockId = opening.current;
    const first = blockId ? spots.byBlock.get(blockId)?.[0] : undefined;
    if (!blockId || !first) return;
    opening.current = null;
    editor.controller.start({ blockId, field: first.key });
  }, [spots, editor.controller]);

  // A statblock just created opens with its first empty value being typed; a restored workspace never moves focus.
  const startRef = useRef(editor.controller.start);
  startRef.current = editor.controller.start;
  const holding = useRef<(() => void) | null>(null);
  useEffect(() => () => holding.current?.(), []);
  useEffect(() => {
    if (focusRequest === handledFocusRequest.current || !writable) return;
    handledFocusRequest.current = focusRequest;
    const empty = spots.order.find((spot) => isEmptyValue(readField(record, spot.field).value)) ?? spots.order[0];
    const card = cardRef.current;
    if (!empty || !card) return;
    const target = { blockId: empty.blockId, field: empty.field.key };
    startRef.current(target);
    holding.current?.();
    holding.current = holdTypingFocus(card, () => startRef.current(target));
  }, [focusRequest, handledFocusRequest, writable, spots, record]);

  return (
    <PaneEditContext.Provider value={editor.controller}>
      <PaneRecoveryContext.Provider value={recovery}>
        <PanelCard
          ref={cardRef}
          chrome={editor.chrome}
          valueEditing={editor.valueEditing}
          template={template}
          name={templateName}
          record={record}
          app={app}
          sourcePath={notePath}
          folded={editor.controller.foldedSet}
          reveal={editor.controller.editing?.blockId ?? null}
          token={character}
        />
        {props.cardMenu}
        {writable && <FoldedChips folded={folded} onUnfold={(blockId) => setUnfolded(blockId, true)} />}
        {props.children}
      </PaneRecoveryContext.Provider>
    </PaneEditContext.Provider>
  );
}
