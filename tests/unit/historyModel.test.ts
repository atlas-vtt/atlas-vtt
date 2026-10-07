import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { create, type StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { getHistoryStore, withHistory, type HistoryState, type HistoryStep } from '../../src/app/stores/history';
import { entriesOf, engineOrder, HistoryModel, written, type CollectionName, type Entries, type ModelStep, type Ref } from '../helpers/historyModel';

// Undo and redo against a naive model of what a step changed, with writes of Atlas itself between.
const RUNS = Number(process.env.VITE_HISTORY_RUNS ?? 150);
const SEED = process.env.VITE_HISTORY_SEED === undefined ? undefined : Number(process.env.VITE_HISTORY_SEED);

type Record_ = Record<string, Ref>;
interface RealState {
  objects: { tokens: Record_; lightZones?: Record_ };
  grid: Ref | null;
  background: null;
  widgetValues: Record<string, number>;
  exploredEdits: number;
  apply: (recipe: (draft: Draft<RealState>) => void) => void;
}
interface Real { store: StoreApi<RealState>; history: () => HistoryState; system: { name: CollectionName; key: string; ref: Ref }[] }

const createReal = (): Real => {
  const store = create<RealState>()(withHistory(immer<RealState>((set) => ({
    objects: { tokens: {} }, grid: null, background: null, widgetValues: {}, exploredEdits: 0, apply: (recipe) => set(recipe),
  }))));
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState(), system: [] };
};

const KEYS = ['a', 'b', 'c', '1', '2', '10'];
let made = 0;
const fresh = (): Ref => ({ v: (made += 1) });
const collection = (draft: Draft<RealState>, name: CollectionName): Record_ => (name === 'tokens' ? draft.objects.tokens : (draft.objects.lightZones ??= {}));
const entriesIn = (record: Record_ | undefined): Entries | null => (record ? Object.keys(record).map((key) => [key, record[key]!] as const) : null);
const realEntries = (real: Real, name: CollectionName): Entries | null => entriesIn(name === 'tokens' ? real.store.getState().objects.tokens : real.store.getState().objects.lightZones);

/** A write by the GM, or by Atlas itself (`untracked`), to the store and the model alike. */
function write(model: HistoryModel, real: Real, gm: boolean, name: CollectionName, recipe: (draft: Record_) => void, next: Entries | null, after?: (draft: Draft<RealState>) => void): void {
  const run = (): void => real.store.getState().apply((draft) => { if (next === null) delete draft.objects.lightZones; else recipe(collection(draft, name)); after?.(draft); });
  if (gm) run(); else real.history().untracked(run);
  model.write(written(model.state, name, next), gm);
}

function verify(model: HistoryModel, real: Real): void {
  for (const name of ['tokens', 'zones'] as const) expect(realEntries(real, name)).toEqual(entriesOf(model.state, name));
  expect(real.store.getState().grid).toBe(model.state.grid);
  expect([real.history().pastStates.length, real.history().futureStates.length]).toEqual([model.past.length, model.future.length]);
}

/** Keys whose presence or value the step changed, in one collection. */
function changedKeys(step: ModelStep, name: CollectionName): Set<string> {
  const before = new Map(entriesOf(step.before, name) ?? []);
  const after = new Map(entriesOf(step.after, name) ?? []);
  return new Set([...before.keys(), ...after.keys()].filter((key) => before.get(key) !== after.get(key) || before.has(key) !== after.has(key)));
}

const tracked = (state: RealState): unknown[] => [state.objects, state.grid, state.background, state.widgetValues, state.exploredEdits];

/** Undo or redo, holding the store to the model and to what a step may and may not touch. */
function travel(model: HistoryModel, real: Real, direction: 'undo' | 'redo'): void {
  const before = real.store.getState();
  const stack = direction === 'undo' ? real.history().pastStates : real.history().futureStates;
  const own: HistoryStep | undefined = stack[stack.length - 1];
  const step = model.travel(direction);
  real.history()[direction]();
  verify(model, real);
  if (!step || !own) return;
  const after = real.store.getState();
  const target = direction === 'undo' ? step.before : step.after;
  for (const name of ['tokens', 'zones'] as const) {
    const changed = changedKeys(step, name);
    const was = new Map(entriesIn(name === 'tokens' ? before.objects.tokens : before.objects.lightZones) ?? []);
    const now = new Map(realEntries(real, name) ?? []);
    const wanted = new Map(entriesOf(target, name) ?? []);
    for (const [key, ref] of was) if (!changed.has(key) && now.has(key)) expect(now.get(key), `P1 ${name}.${key}`).toBe(ref);
    for (const key of changed) expect(now.get(key), `P2 ${name}.${key}`).toBe(wanted.get(key));
    for (const system of real.system) {
      if (system.name === name && was.get(system.key) === system.ref && !changed.has(system.key)) expect(now.get(system.key), `P7 ${name}.${system.key}`).toBe(system.ref);
    }
  }
  // When nothing else wrote since, undo and redo give back the step's other side itself.
  const [side, other] = direction === 'undo' ? [own.after, own.before] : [own.before, own.after];
  if (tracked(before).every((value, i) => value === Object.values(side)[i])) {
    tracked(after).forEach((value, i) => expect(value, 'P4').toBe(Object.values(other)[i]));
  }
}

type Command = fc.Command<HistoryModel, Real>;
const command = (name: string, check: (model: Readonly<HistoryModel>) => boolean, run: (model: HistoryModel, real: Real) => void): Command => ({
  check: (model) => check(model), run: (model, real) => { run(model, real); verify(model, real); }, toString: () => name,
});

const writes = (gm: boolean): fc.Arbitrary<Command>[] => [
  fc.tuple(fc.constantFrom<CollectionName>('tokens', 'zones'), fc.constantFrom(...KEYS)).map(([name, key]) => command(`put ${name}.${key}${gm ? '' : ' by Atlas'}`, () => true, (model, real) => {
    const ref = fresh();
    const entries = entriesOf(model.state, name) ?? [];
    const next = entries.some(([k]) => k === key) ? entries.map(([k, v]) => [k, k === key ? ref : v] as const) : [...entries, [key, ref] as const];
    write(model, real, gm, name, (draft) => { draft[key] = ref; }, next);
    if (!gm && model.depth === 0) real.system.push({ name, key, ref });
  })),
  fc.tuple(fc.constantFrom<CollectionName>('tokens', 'zones'), fc.constantFrom(...KEYS)).map(([name, key]) => command(`delete ${name}.${key}${gm ? '' : ' by Atlas'}`, (model) => (entriesOf(model.state, name) ?? []).some(([k]) => k === key), (model, real) => {
    write(model, real, gm, name, (draft) => { delete draft[key]; }, (entriesOf(model.state, name) ?? []).filter(([k]) => k !== key));
  })),
  fc.tuple(fc.constantFrom<CollectionName>('tokens', 'zones'), fc.constantFrom('a', 'b', 'c')).map(([name, key]) => command(`move ${name}.${key} last${gm ? '' : ' by Atlas'}`, (model) => {
    const entries = engineOrder(entriesOf(model.state, name) ?? []);
    return entries.some(([k]) => k === key) && entries[entries.length - 1]![0] !== key;
  }, (model, real) => {
    const entries = entriesOf(model.state, name)!;
    const ref = entries.find(([k]) => k === key)![1];
    write(model, real, gm, name, (draft) => { delete draft[key]; draft[key] = ref; }, [...entries.filter(([k]) => k !== key), [key, ref] as const]);
  })),
  fc.constant(command(`drop zones${gm ? '' : ' by Atlas'}`, (model) => model.state.objects.zones !== null, (model, real) => write(model, real, gm, 'zones', () => undefined, null))),
  fc.boolean().map((clear) => command(`grid${gm ? '' : ' by Atlas'}`, (model) => !clear || model.state.grid !== null, (model, real) => {
    const grid = clear ? null : fresh();
    const run = (): void => real.store.getState().apply((draft) => { draft.grid = grid; });
    if (gm) run(); else real.history().untracked(run);
    model.write({ ...model.state, grid }, gm);
  })),
];

const commands: fc.Arbitrary<Command>[] = [
  ...writes(true), ...writes(true), ...writes(false),
  fc.constant(command('begin', () => true, (model, real) => { model.begin(); real.history().beginTransaction(); })),
  fc.constant(command('end', () => true, (model, real) => { model.end(); real.history().endTransaction(); })),
  fc.constant(command('abandon', () => true, (model, real) => { model.abandon(); real.history().abandonTransaction(); })),
  fc.constant(command('discard', () => true, (model, real) => { model.discard(); real.history().discardTransaction(); })),
  fc.constant(command('undo', () => true, (model, real) => travel(model, real, 'undo'))),
  fc.constant(command('undo', () => true, (model, real) => travel(model, real, 'undo'))),
  fc.constant(command('redo', () => true, (model, real) => travel(model, real, 'redo'))),
  fc.constant(command('undo and redo', () => true, (model, real) => {
    const before = tracked(real.store.getState());
    // From the step's own side (nothing else wrote since, a transaction's writes included) both come back whole.
    const whole = model.startsFromStep('undo');
    travel(model, real, 'undo');
    travel(model, real, 'redo');
    if (whole) tracked(real.store.getState()).forEach((value, i) => expect(value, 'P5').toBe(before[i]));
  })),
  fc.constant(command('clear', () => true, (model, real) => { model.clear(); real.history().clear(); })),
  fc.constant(command('pause', () => true, (model, real) => { model.tracking = false; real.history().pause(); })),
  fc.constant(command('resume', () => true, (model, real) => { model.tracking = true; real.history().resume(); })),
];

describe('undo and redo against a model of what each step changed', () => {
  it('hold the store to the model, and take back only what a step changed', () => {
    fc.assert(fc.property(fc.commands(commands, { maxCommands: 120, size: 'max' }), (cmds) => {
      fc.modelRun(() => ({ model: new HistoryModel(), real: createReal() }), cmds);
    }), { numRuns: RUNS, ...(SEED === undefined ? {} : { seed: SEED }) });
  });
});
