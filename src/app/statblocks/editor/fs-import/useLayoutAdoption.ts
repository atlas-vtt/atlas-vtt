import { useCallback, useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { statblockCount, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { TemplateId } from '../../model/templateTypes';
import { moveStatblocks, type StatblockMoveResult } from './statblockMove';
import { t } from '../../../i18n';

export type AdoptionPhase =
  | { kind: 'ready' }
  | { kind: 'running'; done: number; total: number }
  /** `result` null: the batch failed before it ended, which `problem` says. */
  | { kind: 'finished'; result: StatblockMoveResult | null; problem: string | null };

export interface LayoutAdoption {
  phase: AdoptionPhase;
  adopt: () => void;
  /** Stops at the next note; the notes not reached stay as they were. */
  cancel: () => void;
}

/**
 * The batch that moves a layout's statblocks to Atlas (§6.4), one note after
 * the other, with progress and Cancel. Unmounting cancels it.
 */
export function useLayoutAdoption(app: App, statblocks: LayoutStatblocks, templateId: TemplateId): LayoutAdoption {
  const [phase, setPhase] = useState<AdoptionPhase>({ kind: 'ready' });
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  const latest = useRef({ app, statblocks, templateId });
  latest.current = { app, statblocks, templateId };

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);

  const adopt = useCallback((): void => {
    if (controller.current) return;
    const { app: vault, statblocks: notes, templateId: id } = latest.current;
    const abort = new AbortController();
    controller.current = abort;
    const show = (next: AdoptionPhase): void => { if (live.current) setPhase(next); };
    show({ kind: 'running', done: 0, total: statblockCount(notes) });
    moveStatblocks(vault, notes, id, { signal: abort.signal, onProgress: (done, total) => show({ kind: 'running', done, total }) }).then(
      (result) => show({ kind: 'finished', result, problem: null }),
      (error: unknown) => {
        console.error('[Atlas] Moving statblocks to Atlas failed:', error);
        show({ kind: 'finished', result: null, problem: t('statblockEditor.fs.unfinished', { problem: error instanceof Error ? error.message : String(error) }) });
      },
    );
  }, []);

  const cancel = useCallback((): void => { controller.current?.abort(); }, []);

  return { phase, adopt, cancel };
}
