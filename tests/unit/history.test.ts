import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  HISTORY_LIMIT,
  abandonHistoryTransaction,
  beginHistoryTransaction,
  endHistoryTransaction,
  getHistoryStore,
  runHistoryTransaction,
  runUntracked,
  withHistory,
  type HistoryState,
} from '../../src/app/stores/history';

interface TestState {
  objects: { tokens: Record<string, { x: number; y: number }> };
  grid: { size: number } | null;
  background: string | null;
  widgetValues: Record<string, number>;
  selectedIds: string[];
  moveToken: (id: string, x: number, y: number) => void;
  setSelection: (ids: string[]) => void;
}

function createTestStore() {
  const store = create<TestState>()(
    withHistory(
      immer<TestState>((set) => ({
        objects: { tokens: { a: { x: 0, y: 0 } } },
        grid: null,
        background: null,
        widgetValues: {},
        selectedIds: [],
        moveToken: (id, x, y) =>
          set((draft) => {
            const token = draft.objects.tokens[id];
            if (token) {
              token.x = x;
              token.y = y;
            }
          }),
        setSelection: (ids) =>
          set((draft) => {
            draft.selectedIds = ids;
          }),
      })),
    ),
  );
  const history = getHistoryStore(store) as ReturnType<typeof getHistoryStore> & { getState: () => HistoryState };
  return { store, history: history.getState.bind(history) };
}

const tokenA = (store: ReturnType<typeof createTestStore>['store']) => store.getState().objects.tokens.a!;

describe('history', () => {
  it('records one undo step per discrete write', () => {
    const { store, history } = createTestStore();
    store.getState().moveToken('a', 10, 0);
    store.getState().moveToken('a', 20, 0);
    expect(history().pastStates).toHaveLength(2);
  });

  it('ignores writes to untracked fields', () => {
    const { store, history } = createTestStore();
    store.getState().setSelection(['a']);
    expect(history().pastStates).toHaveLength(0);
  });

  it('leaves no step for an abandoned transaction whose gesture put its changes back', () => {
    const { store, history } = createTestStore();
    beginHistoryTransaction(store);
    store.getState().moveToken('a', 30, 0);
    store.getState().moveToken('a', 0, 0);
    abandonHistoryTransaction(store);
    expect(history().pastStates).toHaveLength(0);
    store.getState().moveToken('a', 5, 0);
    expect(history().pastStates).toHaveLength(1);
  });

  it('keeps the transaction around an abandoned one open', () => {
    const { store, history } = createTestStore();
    beginHistoryTransaction(store);
    store.getState().moveToken('a', 10, 0);
    beginHistoryTransaction(store);
    store.getState().moveToken('a', 30, 0);
    store.getState().moveToken('a', 10, 0);
    abandonHistoryTransaction(store);
    store.getState().moveToken('a', 12, 0);
    expect(history().pastStates).toHaveLength(0);
    endHistoryTransaction(store);
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(tokenA(store)).toEqual({ x: 0, y: 0 });
  });

  it('collapses a transaction into a single undo step that restores the start state', () => {
    const { store, history } = createTestStore();

    beginHistoryTransaction(store);
    for (let x = 1; x <= 30; x += 1) store.getState().moveToken('a', x, 0);
    endHistoryTransaction(store);

    expect(history().pastStates).toHaveLength(1);
    expect(tokenA(store)).toEqual({ x: 30, y: 0 });

    history().undo();
    expect(tokenA(store)).toEqual({ x: 0, y: 0 });
    expect(history().pastStates).toHaveLength(0);

    history().redo();
    expect(tokenA(store)).toEqual({ x: 30, y: 0 });
  });

  it('records nothing when a transaction makes no net change', () => {
    const { store, history } = createTestStore();
    runHistoryTransaction(store, () => {
      store.getState().setSelection(['a']);
    });
    expect(history().pastStates).toHaveLength(0);
  });

  it('merges nested transactions into the outermost one', () => {
    const { store, history } = createTestStore();
    runHistoryTransaction(store, () => {
      store.getState().moveToken('a', 5, 5);
      runHistoryTransaction(store, () => {
        store.getState().moveToken('a', 9, 9);
      });
      store.getState().moveToken('a', 12, 12);
    });
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(tokenA(store)).toEqual({ x: 0, y: 0 });
  });

  it('clears redo history when a transaction commits', () => {
    const { store, history } = createTestStore();
    store.getState().moveToken('a', 1, 1);
    history().undo();
    expect(history().futureStates).toHaveLength(1);

    runHistoryTransaction(store, () => store.getState().moveToken('a', 2, 2));
    expect(history().futureStates).toHaveLength(0);
  });

  it('does not record untracked writes', () => {
    const { store, history } = createTestStore();
    runUntracked(store, () => store.getState().moveToken('a', 7, 7));
    expect(history().pastStates).toHaveLength(0);
    expect(tokenA(store)).toEqual({ x: 7, y: 7 });
  });

  it('respects pause while a transaction is open', () => {
    const { store, history } = createTestStore();
    history().pause();
    runHistoryTransaction(store, () => store.getState().moveToken('a', 3, 3));
    expect(history().pastStates).toHaveLength(0);

    history().resume();
    runHistoryTransaction(store, () => store.getState().moveToken('a', 4, 4));
    expect(history().pastStates).toHaveLength(1);
  });

  it('tolerates unbalanced endTransaction calls', () => {
    const { store, history } = createTestStore();
    endHistoryTransaction(store);
    store.getState().moveToken('a', 1, 0);
    expect(history().pastStates).toHaveLength(1);
  });

  it('caps the stack at the history limit', () => {
    const { store, history } = createTestStore();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      runHistoryTransaction(store, () => store.getState().moveToken('a', i, 0));
    }
    expect(history().pastStates).toHaveLength(HISTORY_LIMIT);
  });

  it('is a no-op for stores without history', () => {
    const plain = create<{ n: number }>()(() => ({ n: 0 }));
    expect(getHistoryStore(plain)).toBeNull();
    expect(runHistoryTransaction(plain, () => 42)).toBe(42);
    expect(runUntracked(plain, () => 'ok')).toBe('ok');
    expect(() => beginHistoryTransaction(plain)).not.toThrow();
  });
});
