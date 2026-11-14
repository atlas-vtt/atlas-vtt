import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { statblockCount, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { TemplateId } from '../../model/templateTypes';
import type { NoteBatchOptions } from '../../notes/noteBatch';
import { moveStatblocks, moveWithStatblockValues, notesWithOtherValues, type StatblockMoveResult } from './statblockMove';
import { t } from '../../../i18n';

export type AdoptionPhase =
  | { kind: 'ready' }
  | { kind: 'running'; done: number; total: number }
  /** `result` null: the batch failed before it ended, which `problem` says. */
  | { kind: 'finished'; result: StatblockMoveResult | null; problem: string | null };

export interface LayoutAdoption {
  phase: AdoptionPhase;
  adopt: () => void;
  /** Moves the notes the batch left for holding other values than their statblocks, with the statblocks' values, as one more batch. */
  takeStatblockValues: () => void;
  /** Stops at the next note; the notes not reached stay as they were. */
  cancel: () => void;
}

/**
 * The batch that moves a layout's statblocks to Atlas (§6.4), one note after
 * the other, with progress and Cancel, and the batch after it for the notes
 * that hold other values, should the GM choose the statblocks'. Unmounting
 * cancels either.
 */
export function useLayoutAdoption(app: App, statblocks: LayoutStatblocks, templateId: TemplateId): LayoutAdoption {
  const [phase, setPhase] = useState<AdoptionPhase>({ kind: 'ready' });
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const running = useRef(false);
  const latest = useRef({ app, statblocks, templateId, phase });
  latest.current = { app, statblocks, templateId, phase };

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback((total: number, batch: (options: NoteBatchOptions) => Promise<StatblockMoveResult>): void => {
    if (running.current) return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const show = (next: AdoptionPhase): void => { if (live.current) setPhase(next); };
    show({ kind: 'running', done: 0, total });
    const finish = (result: StatblockMoveResult | null, problem: string | null): void => {
      running.current = false;
      show({ kind: 'finished', result, problem });
    };
    batch({ signal: abort.signal, onProgress: (done, of) => show({ kind: 'running', done, total: of }) }).then(
      (result) => finish(result, null),
      (error: unknown) => {
        console.error('[Atlas] Moving statblocks to Atlas failed:', error);
        finish(null, t('statblockEditor.fs.unfinished', { problem: error instanceof Error ? error.message : String(error) }));
      },
    );
  }, []);

  const adopt = useCallback((): void => {
    const { app: vault, statblocks: notes, templateId: id, phase: now } = latest.current;
    if (now.kind === 'ready') run(statblockCount(notes), (options) => moveStatblocks(vault, notes, id, options));
  }, [run]);

  const takeStatblockValues = useCallback((): void => {
    const { app: vault, templateId: id, phase: now } = latest.current;
    const earlier = now.kind === 'finished' ? now.result : null;
    const total = earlier ? notesWithOtherValues(earlier).length : 0;
    if (earlier && total > 0) run(total, (options) => moveWithStatblockValues(vault, earlier, id, options));
  }, [run]);

  const cancel = useCallback((): void => { controller.current?.abort(); }, []);

  return { phase, adopt, takeStatblockValues, cancel };
}
