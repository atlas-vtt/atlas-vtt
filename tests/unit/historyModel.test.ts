import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Draft } from 'immer';
import { ABSENT, engineOrder, HistoryModel, newId, recOf, slotOf, type CollectionName, type ModelState, type Rec, type Value } from '../helpers/historyModel';
import { createReal, realSlot, trackedRefs, travel, verify, type Real, type RealState, type WholeBranch } from '../helpers/historyModelChecks';

// Undo and redo against a naive model of what each step changed, with writes of Atlas itself
// (and unrecorded writes while paused) between steps and inside open transactions.
const RUNS = Number(process.env.VITE_HISTORY_RUNS ?? 150);
const SEED = process.env.VITE_HISTORY_SEED === undefined ? undefined : Number(process.env.VITE_HISTORY_SEED);

const KEYS = ['a', 'b', 'c', '1', '2', '10'];
const WIDGET_KEYS = ['fear', 'torches', '3'];
const BACKGROUNDS = [null, 'maps/a.webp', 'maps/b.webp'];
let made = 0;
const earlier = new Map<string, object[]>();
const fresh = (key: string): object => {
  const ref = { v: (made += 1) };
  earlier.set(key, [...(earlier.get(key) ?? []), ref]);
  return ref;
};

function withRec(state: ModelState, name: CollectionName, rec: Rec | null): ModelState {
  if (name === 'widgets') return { ...state, widgets: rec! };
  const objects = name === 'tokens' ? { ...state.objects, tokens: rec! } : { ...state.objects, zones: rec };
  return { ...state, objects: { ...objects, id: newId() } };
}

/** The model after a write that puts `value` (or removes the key): unchanged when it changes nothing, as with Immer. */
function withSlot(state: ModelState, name: CollectionName, key: string, value: Value | typeof ABSENT): ModelState {
  const entries = recOf(state, name)?.entries ?? [];
  if (slotOf(entries, key) === value) return state;
  const next = value === ABSENT
    ? entries.filter(([k]) => k !== key)
    : slotOf(entries, key) === ABSENT ? [...entries, [key, value] as const] : entries.map(([k, v]) => [k, k === key ? value : v] as const);
  return withRec(state, name, { id: newId(), entries: engineOrder(next) });
}

const draftOf = (draft: Draft<RealState>, name: CollectionName): Record<string, unknown> =>
  name === 'tokens' ? draft.objects.tokens : name === 'zones' ? (draft.objects.lightZones ??= {}) : draft.widgetValues;

/** A write of the GM, or of Atlas itself (`untracked`), to the store and the model alike. */
function write(model: HistoryModel, real: Real, gm: boolean, run: () => void, next: ModelState, own?: { where: CollectionName | WholeBranch; key: string }): void {
  if (gm) run();
  else real.history().untracked(run);
  model.write(next, gm);
  if (!gm && own && model.depth === 0) real.own.push({ ...own, value: realSlot(real.store.getState(), own.where, own.key) });
}

const apply = (real: Real, recipe: (draft: Draft<RealState>) => void): (() => void) => () => real.store.getState().apply(recipe);

type Command = fc.Command<HistoryModel, Real>;
const command = (name: string, check: (model: Readonly<HistoryModel>) => boolean, run: (model: HistoryModel, real: Real) => void): Command => ({
  check: (model) => check(model), run: (model, real) => { run(model, real); verify(model, real); }, toString: () => name,
});
const present = (model: Readonly<HistoryModel>, name: CollectionName, key: string): boolean => slotOf(recOf(model.state, name)?.entries ?? [], key) !== ABSENT;
const collections = fc.constantFrom<CollectionName>('tokens', 'zones');
const anyCollection = fc.constantFrom<CollectionName>('tokens', 'zones', 'widgets');
const keyIn = (name: CollectionName): string[] => (name === 'widgets' ? WIDGET_KEYS : KEYS);

function writes(gm: boolean): fc.Arbitrary<Command>[] {
  const by = gm ? '' : ' by Atlas';
  return [
    fc.tuple(collections, fc.constantFrom(...KEYS), fc.boolean()).map(([name, key, again]) => command(`put ${name}.${key}${again ? ' (an earlier value)' : ''}${by}`, () => true, (model, real) => {
      const ref = again && earlier.has(key) ? earlier.get(key)![0]! : fresh(key);
      write(model, real, gm, apply(real, (draft) => { draftOf(draft, name)[key] = ref; }), withSlot(model.state, name, key, ref), { where: name, key });
    })),
    fc.tuple(fc.constantFrom(...WIDGET_KEYS), fc.integer({ min: 0, max: 3 })).map(([key, value]) => command(`widget ${key} = ${value}${by}`, () => true, (model, real) => {
      write(model, real, gm, apply(real, (draft) => { draft.widgetValues[key] = value; }), withSlot(model.state, 'widgets', key, value), { where: 'widgets', key });
    })),
    anyCollection.chain((name) => fc.constantFrom(...keyIn(name)).map((key) => command(`delete ${name}.${key}${by}`, (model) => present(model, name, key), (model, real) => {
      write(model, real, gm, apply(real, (draft) => { delete draftOf(draft, name)[key]; }), withSlot(model.state, name, key, ABSENT), { where: name, key });
    }))),
    anyCollection.chain((name) => fc.constantFrom(...keyIn(name)).map((key) => command(`move ${name}.${key} last${by}`, (model) => present(model, name, key), (model, real) => {
      const entries = recOf(model.state, name)!.entries;
      const value = slotOf(entries, key) as Value;
      const next = withRec(model.state, name, { id: newId(), entries: engineOrder([...entries.filter(([k]) => k !== key), [key, value]]) });
      write(model, real, gm, apply(real, (draft) => { const record = draftOf(draft, name); delete record[key]; record[key] = value; }), next);
    }))),
    fc.constant(command(`drop zones${by}`, (model) => model.state.objects.zones !== null, (model, real) => {
      write(model, real, gm, apply(real, (draft) => { delete draft.objects.lightZones; }), withRec(model.state, 'zones', null));
    })),
    fc.boolean().map((clear) => command(`grid${clear ? ' cleared' : ''}${by}`, () => true, (model, real) => {
      const grid = clear ? null : fresh('grid');
      const next = model.state.grid === grid ? model.state : { ...model.state, grid };
      write(model, real, gm, apply(real, (draft) => { draft.grid = grid; }), next, { where: 'grid', key: '' });
    })),
    fc.constantFrom(...BACKGROUNDS).map((background) => command(`background ${background}${by}`, () => true, (model, real) => {
      write(model, real, gm, apply(real, (draft) => { draft.background = background; }), { ...model.state, background }, { where: 'background', key: '' });
    })),
    fc.constant(command(`memory edit${by}`, () => true, (model, real) => {
      write(model, real, gm, apply(real, (draft) => { draft.exploredEdits += 1; }), { ...model.state, edits: model.state.edits + 1 }, { where: 'edits', key: '' });
    })),
    fc.constant(command(`tokens copied whole${by}`, () => true, (model, real) => {
      const run = (): void => { const { objects } = real.store.getState(); real.store.setState({ objects: { ...objects, tokens: { ...objects.tokens } } }); };
      write(model, real, gm, run, withRec(model.state, 'tokens', { id: newId(), entries: model.state.objects.tokens.entries }));
    })),
    fc.constant(command(`untracked field${by}`, () => true, (model, real) => {
      write(model, real, gm, apply(real, (draft) => { draft.notTracked += 1; }), model.state);
    })),
  ];
}

/** Undo then redo, or redo then undo, with nothing between: every branch comes back as the very object it was (P5). */
const roundTrip = (first: 'undo' | 'redo'): Command => command(`${first} and back`, () => true, (model, real) => {
  const before = trackedRefs(real.store.getState());
  if (!travel(model, real, first)) return;
  expect(travel(model, real, first === 'undo' ? 'redo' : 'undo')).toBe(true);
  trackedRefs(real.store.getState()).forEach((value, i) => expect(value, 'P5').toBe(before[i]));
});

const commands: fc.Arbitrary<Command>[] = [
  ...writes(true), ...writes(true), ...writes(false),
  fc.constant(command('begin', () => true, (model, real) => { model.begin(); real.history().beginTransaction(); })),
  fc.constant(command('end', () => true, (model, real) => { model.end(); real.history().endTransaction(); })),
  fc.constant(command('abandon', () => true, (model, real) => { model.abandon(); real.history().abandonTransaction(); })),
  fc.constant(command('discard', () => true, (model, real) => { model.discard(); real.history().discardTransaction(); })),
  fc.constant(command('undo', () => true, (model, real) => { travel(model, real, 'undo'); })),
  fc.constant(command('undo', () => true, (model, real) => { travel(model, real, 'undo'); })),
  fc.constant(command('redo', () => true, (model, real) => { travel(model, real, 'redo'); })),
  fc.constant(roundTrip('undo')),
  fc.constant(roundTrip('redo')),
  fc.constant(command('clear', () => true, (model, real) => { model.clear(); real.history().clear(); })),
  fc.constant(command('pause', () => true, (model, real) => { model.tracking = false; real.history().pause(); })),
  fc.constant(command('resume', () => true, (model, real) => { model.tracking = true; real.history().resume(); })),
];

describe('undo and redo against a model of what each step changed', () => {
  it('hold the store to the model, and take back and bring back only what a step changed', () => {
    fc.assert(fc.property(fc.commands(commands, { maxCommands: 120, size: 'max' }), (cmds) => {
      fc.modelRun(() => ({ model: new HistoryModel(), real: createReal() }), cmds);
    }), { numRuns: RUNS, ...(SEED === undefined ? {} : { seed: SEED }) });
  }, 600_000);
});
