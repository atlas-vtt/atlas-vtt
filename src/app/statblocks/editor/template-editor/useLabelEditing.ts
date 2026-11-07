import { useCallback, useMemo, useRef, useState } from 'react';
import { shownHeaderParts, templateBlock } from '../../model/templateHeader';
import { flattenReadingOrder } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { LabelEditing } from './ChromeLayer';
import { commitLabel } from './labelCommit';
import { labelTargetIn, labelTargetOf, metricLabelParts, type LabelPart } from './labelTargets';
import type { BlockSelection } from './selection';
import { applyEdit, readOnlyMessage } from './sessionEdit';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import type { CollectionFieldKeys } from './useCollectionFieldKeys';
import { t } from '../../../i18n';

export interface LabelEditingInput {
  session: EditorSession;
  snapshot: SessionSnapshot;
  collectionKeys: CollectionFieldKeys;
  select: (selection: BlockSelection, focus?: boolean) => void;
  announce: (text: string) => void;
  drawn: (id: string) => boolean;
}

interface OpenLabel {
  id: string;
  kind: LabelEditing['kind'];
  text: string;
  part?: LabelPart | undefined;
}

/** One label to open: a block, and which of a Metric's or a Table's labels. */
interface LabelStop {
  id: string;
  part?: LabelPart | undefined;
}

export interface LabelEditingState {
  /** The label being edited, for the canvas; null while none is. */
  editing: LabelEditing | null;
  /** Opens a block's label; `part` picks one of a Metric's (its heading, or a number's name). */
  editLabel: (id: string, part?: LabelPart) => void;
  /** Commits `text` as that label, as Enter in it does: one step, and a block's first label names its property. */
  commitLabelText: (id: string, text: string, part: LabelPart | undefined) => void;
}

/** Every label of the drawn blocks in reading order, the header's parts first, a Metric's heading and numbers each one. */
function labelStops(template: StatblockTemplate, drawn: (id: string) => boolean): LabelStop[] {
  const header = shownHeaderParts(template).filter((part) => drawn(part.block.id)).map((part): LabelStop => ({ id: part.block.id }));
  return [...header, ...flattenReadingOrder(template.layout.blocks).flatMap((block): LabelStop[] => {
    if (!drawn(block.id)) return [];
    if (block.type === 'metric') return metricLabelParts(block).map((part) => ({ id: block.id, part }));
    return labelTargetOf(block, template.fields) ? [{ id: block.id }] : [];
  })];
}

/** The label after the one open (or before it) in reading order. */
function labelledNeighbour(template: StatblockTemplate, open: LabelStop, step: 1 | -1, drawn: (id: string) => boolean): LabelStop | null {
  const stops = labelStops(template, drawn);
  const from = stops.findIndex((stop) => stop.id === open.id && stop.part === open.part);
  return from < 0 ? null : stops[from + step] ?? null;
}

/** What the live region says when a first label bound its block. */
function boundMessage(bound: { key: string; created: boolean; fromCollection: boolean }, keys: CollectionFieldKeys): string {
  if (bound.fromCollection) {
    const count = keys.get(bound.key) ?? 0;
    return t('templateEditor.bound.collection', { count });
  }
  return bound.created ? t('templateEditor.bound.created') : t('templateEditor.bound.own');
}

/**
 * Inline label editing (§7.6): which block's label is open, and committing
 * it through the session as one step. Tab commits and opens the next label,
 * Shift+Tab the one before; Escape reverts.
 */
export function useLabelEditing(input: LabelEditingInput): LabelEditingState {
  // What the label said when it opened: later edits of the block do not reset what is typed.
  const [open, setOpen] = useState<OpenLabel | null>(null);
  const latest = useRef(input);
  latest.current = input;

  const openAt = useCallback((id: string, template: StatblockTemplate, part?: LabelPart): boolean => {
    const target = labelTargetIn(template, id, part);
    if (!target) return false;
    latest.current.select([id], false);
    setOpen({ id, kind: target.kind, text: target.text, part: target.part });
    return true;
  }, []);

  const editLabel = useCallback((id: string, part?: LabelPart): void => {
    // The session's own snapshot: a block inserted a moment ago is in it before the editor renders again.
    const { session, announce } = latest.current;
    const snapshot = session.getSnapshot();
    const locked = readOnlyMessage(snapshot);
    if (locked) {
      announce(locked);
      return;
    }
    openAt(id, snapshot.template, part);
  }, [openAt]);

  const commit = useCallback((id: string, text: string, part: LabelPart | undefined): void => {
    const { session, collectionKeys, announce } = latest.current;
    const bound = applyEdit(session, (template) => {
      const result = commitLabel(template, id, text, collectionKeys.keys(), part);
      return { template: result.template, result: result.bound ?? null };
    });
    if (bound) announce(boundMessage(bound, collectionKeys));
  }, []);

  const close = useCallback((id: string, refocus = true): void => {
    setOpen(null);
    if (refocus) latest.current.select([id], true);
  }, []);

  const exists = open !== null && templateBlock(input.snapshot.template, open.id) !== null;

  const editing = useMemo((): LabelEditing | null => {
    if (!open || !exists) return null;
    const { id, part } = open;
    return {
      blockId: id,
      kind: open.kind,
      text: open.text,
      part,
      onCommit: (text, refocus) => {
        commit(id, text, part);
        close(id, refocus);
      },
      onCancel: () => close(id),
      onStep: (text, step) => {
        commit(id, text, part);
        const { session, drawn } = latest.current;
        const template = session.getSnapshot().template;
        const next = labelledNeighbour(template, { id, part }, step, drawn);
        if (next === null || !openAt(next.id, template, next.part)) close(id);
      },
    };
  }, [open, exists, commit, close, openAt]);

  return { editing, editLabel, commitLabelText: commit };
}
