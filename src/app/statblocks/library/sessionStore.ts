/**
 * The draft of one template session: a zustand + immer store with a zundo
 * history over the template alone (§7.8). Every edit is a pure function of
 * the template the store holds when it runs, never of one captured earlier.
 */

import { castDraft } from 'immer';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createHistoryOptions, type HistorySlice } from './sessionHistory';
import type { StatblockTemplate } from '../model/templateTypes';

/** An edit of a template: a pure function that returns its input when it changes nothing. */
export type TemplateEdit = (template: StatblockTemplate) => StatblockTemplate;

export interface TemplateDraftState {
  template: StatblockTemplate;
  /** Puts the edited template in place; an edit that changes nothing writes nothing, so it makes no step. */
  edit: (edit: TemplateEdit) => void;
}

/** What one undo step holds. */
export type TemplateHistoryStep = Pick<TemplateDraftState, 'template'>;

export type TemplateDraftStore = StoreApi<TemplateDraftState>;

const TEMPLATE_HISTORY: HistorySlice<TemplateDraftState, TemplateHistoryStep> = {
  partialize: (state) => ({ template: state.template }),
  equality: (past, current) => past.template === current.template,
};

/**
 * Whether two templates are the same: the same object, or a copy whose every
 * top-level value is the very one the other holds (an edit that spread the
 * template and changed nothing).
 */
export function sameTemplate(a: StatblockTemplate, b: StatblockTemplate): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof StatblockTemplate)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key]);
}

export function createTemplateDraftStore(template: StatblockTemplate): TemplateDraftStore {
  let store: TemplateDraftStore | null = null;
  const getState = (): TemplateDraftState => {
    if (!store) throw new Error('The template draft store is not ready yet.');
    return store.getState();
  };
  store = createStore<TemplateDraftState>()(
    temporal(
      immer((set, get) => ({
        template,
        edit: (edit) => set((state) => {
          const current = get().template;
          const next = edit(current);
          if (!sameTemplate(next, current)) state.template = castDraft(next);
        }),
      })),
      createHistoryOptions(getState, TEMPLATE_HISTORY),
    ),
  );
  return store;
}
