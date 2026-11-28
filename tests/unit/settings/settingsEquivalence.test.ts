// @vitest-environment jsdom
/**
 * The settings service before #871 (frozen in `tests/oracles/settingsServiceBaseline/`) and the
 * one now, driven through the same generated sequences of writes, save waits, restarts and files
 * arriving from another device. After every step both are compared on everything a user or another
 * device can see: every preference read, the listeners told, the saves, the settings file and the
 * device's local storage. A difference passes only as one of the changes #871 makes on purpose,
 * named for that step:
 * - `unchanged`: a write that reads back as the value already there stores nothing and tells no one;
 * - `malformed`: a stored value Atlas cannot use reads as the default;
 * - `kept`: the file keeps what it held (no defaults filled in, nothing rewritten in a checked
 *   form, only the fields a change names), which reads the same.
 * `VITE_SETTINGS_EQUIVALENCE_SEQUENCES` sets how many sequences run (300 by default).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { PREFERENCES } from '../../../src/app/services/preferences/preferences';
import { DEVICE_PREFERENCES } from '../../../src/app/services/deviceSettings';
import { sameValue, type AnyPreferenceRow } from '../../../src/app/services/preferences/preferenceRow';
import { SettingsService as SettingsServiceBefore } from '../../oracles/settingsServiceBaseline/SettingsService';
import { PREFERENCE_ACCESS as ACCESS_BEFORE } from '../../oracles/settingsServiceBaseline/preferenceAccess';
import { memoryPluginData } from '../../mocks/pluginData';
import { PREFERENCE_ACCESS, type PreferenceName } from './preferenceAccess';
import { randomDevice, randomFile, randomStep, seeded, type Step } from './equivalenceSteps';

const SEQUENCES = Number(process.env.VITE_SETTINGS_EQUIVALENCE_SEQUENCES ?? 300);
const STEPS = 30;

type Change = 'unchanged' | 'malformed' | 'kept';

const NAMES = Object.keys(PREFERENCE_ACCESS) as PreferenceName[];
const SYNCED_ROWS: readonly AnyPreferenceRow[] = Object.values(PREFERENCES).filter((row) => row.store === 'synced');
const SYNCED_KEYS = [...new Set(SYNCED_ROWS.flatMap((row) => row.keys))];
const DEVICE_ROWS: readonly AnyPreferenceRow[] = Object.values(DEVICE_PREFERENCES);
const DEVICE_KEYS = [...new Set(DEVICE_ROWS.flatMap((row) => row.keys))];
const keysOf = (name: PreferenceName): readonly string[] => PREFERENCE_ACCESS[name].keys;

interface Service {
  initialize(): Promise<void>;
  reload(): Promise<void>;
  saveSettingsNow(): Promise<void>;
  onChange(listener: () => void): () => void;
}

interface Snapshot {
  heard: number;
  saves: number;
  file: Record<string, unknown>;
  device: Record<string, unknown>;
  reads: Record<string, string>;
}

/** One service, before or now, with its own vault data and device. */
class Side {
  readonly app = new App();
  readonly data;
  private service!: Service;
  private heard = 0;

  constructor(private readonly before: boolean, file: unknown, device: Record<string, string>) {
    for (const [key, stored] of Object.entries(device)) this.app.saveLocalStorage(key, stored);
    this.data = memoryPluginData(structuredClone(file));
  }

  async start(): Promise<void> {
    this.service = this.before ? new SettingsServiceBefore(this.app, undefined, this.data) : new SettingsService(this.app, undefined, this.data);
    await this.service.initialize();
    this.service.onChange(() => { this.heard += 1; });
  }

  read(name: PreferenceName): string {
    try {
      const value = this.before
        ? ACCESS_BEFORE[name].read({ settings: this.service as SettingsServiceBefore, app: this.app })
        : PREFERENCE_ACCESS[name].read({ settings: this.service as SettingsService, app: this.app });
      return JSON.stringify(value, Object.keys(flatKeys(value)).sort());
    } catch (error) {
      return `threw ${(error as Error).message}`;
    }
  }

  async step(step: Step): Promise<void> {
    if (step.kind === 'write') {
      const write = (): void => this.before
        ? ACCESS_BEFORE[step.name].write({ settings: this.service as SettingsServiceBefore, app: this.app }, step.value as never)
        : PREFERENCE_ACCESS[step.name].write({ settings: this.service as SettingsService, app: this.app }, step.value as never);
      try { write(); } catch { /* both refuse the same conflicting hotkey; the reads compare what is left */ }
    } else if (step.kind === 'wait') {
      await vi.advanceTimersByTimeAsync(600);
    } else if (step.kind === 'restart') {
      await this.service.saveSettingsNow();
      await this.start();
    } else {
      this.data.set(structuredClone(step.file));
      await this.service.reload();
    }
  }

  snapshot(): Snapshot {
    return {
      heard: this.heard,
      saves: this.data.saveData.mock.calls.length,
      file: { ...(this.data.stored() as Record<string, unknown> | null) },
      device: Object.fromEntries(DEVICE_KEYS.map((key) => [key, this.app.loadLocalStorage(key)])),
      reads: Object.fromEntries(NAMES.map((name) => [name, this.read(name)])),
    };
  }
}

/** Every key of a value at any depth, so JSON of two equal records compares equal whatever their order. */
function flatKeys(value: unknown, into: Record<string, true> = {}): Record<string, true> {
  if (typeof value === 'object' && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      into[key] = true;
      flatKeys(inner, into);
    }
  }
  return into;
}

const readsOf = (rows: readonly AnyPreferenceRow[], store: Record<string, unknown>, key: string): unknown[] =>
  rows.filter((row) => row.keys.includes(key)).map((row) => row.read((name) => store[name] ?? undefined));

/** Whether a stored value is no value the rows now read as itself: the rows read it as their default. */
const malformedRead = (name: PreferenceName, read: string): boolean => {
  const row = PREFERENCES[name as keyof typeof PREFERENCES] as AnyPreferenceRow | undefined;
  if (!row || row.store !== 'synced' || row.keys.length !== 1 || read.startsWith('threw')) return false;
  const value: unknown = read === undefined ? undefined : JSON.parse(read);
  return !sameValue(row.read(() => value), value);
};

const notItself = (key: string, stored: unknown): boolean =>
  stored !== undefined && SYNCED_ROWS.some((row) => row.keys.length === 1 && row.keys[0] === key && !sameValue(row.read(() => stored), stored));

interface Tally {
  steps: number;
  differing: number;
  changes: Record<Change, number>;
  unexplained: string[];
}

async function runSequence(seed: number, tally: Tally): Promise<void> {
  const random = seeded(seed);
  const file = randomFile(random, SYNCED_KEYS);
  const device = randomDevice(random, DEVICE_KEYS);
  const before = new Side(true, file, device);
  const now = new Side(false, file, device);
  await before.start();
  await now.start();
  /** Keys the service before rewrote with an unchanged write and has not saved since. */
  const unsavedNoChange = new Set<string>();
  /** Keys a file held a value of that the rows read as something else, until the service now saves. */
  const readAsOther = new Set<string>(Object.keys(file ?? {}).filter((key) => notItself(key, (file as Record<string, unknown>)[key])));
  /** Preferences whose reads parted for a named change, and the change. */
  const parted = new Map<PreferenceName, Change>();
  /** File keys that parted when another device's file arrived, and the change that let them. */
  const partedKeys = new Map<string, Change>();
  let previous = [before.snapshot(), now.snapshot()] as const;
  for (let index = 0; index < STEPS; index += 1) {
    const step = randomStep(random, NAMES, SYNCED_KEYS);
    await before.step(step);
    await now.step(step);
    const [was, is] = [before.snapshot(), now.snapshot()];
    const named = new Set<Change>();
    const name = (change: Change): true => { named.add(change); return true; };
    const fail = (what: string): void => { tally.unexplained.push(`sequence ${seed} step ${index} (${step.kind}${step.kind === 'write' ? ` ${step.name} ${JSON.stringify(step.value)}` : ''}): ${what}`); };
    const heard = [was.heard - previous[0].heard, is.heard - previous[1].heard];
    const saves = [was.saves - previous[0].saves, is.saves - previous[1].saves];
    const nowStill = heard[1] === 0 && sameValue(is.device, previous[1].device);
    const writeUnchanged = step.kind === 'write' && nowStill;
    if (writeUnchanged && step.kind === 'write' && heard[0] > 0) keysOf(step.name).forEach((key) => unsavedNoChange.add(key));
    if (step.kind === 'arrive') {
      Object.entries((step.file ?? {}) as Record<string, unknown>).forEach(([key, stored]) => { if (notItself(key, stored)) readAsOther.add(key); });
      unsavedNoChange.forEach((key) => partedKeys.set(key, 'unchanged'));
      readAsOther.forEach((key) => { if (!partedKeys.has(key)) partedKeys.set(key, 'kept'); });
    }

    if (heard[0] !== heard[1]) {
      const partedChange = step.kind === 'write' ? parted.get(step.name) : undefined;
      if (!(writeUnchanged && heard[0] > heard[1] && name('unchanged')) && !(partedChange && name(partedChange))) fail(`told listeners ${heard[0]} times before, ${heard[1]} now`);
    }
    if (saves[0] !== saves[1]) {
      if (saves[0] > saves[1] && unsavedNoChange.size > 0 && name('unchanged')) {
        // The save before wrote what memory held; the file now waits for the next change, which writes the same
        for (const key of new Set([...Object.keys(was.file), ...Object.keys(is.file)])) if (!sameValue(was.file[key], is.file[key])) partedKeys.set(key, 'unchanged');
      } else fail(`saved ${saves[0]} times before, ${saves[1]} now`);
    }
    for (const key of DEVICE_KEYS.filter((each) => !sameValue(was.device[each], is.device[each]))) {
      const sameReads = sameValue(readsOf(DEVICE_ROWS, was.device, key), readsOf(DEVICE_ROWS, is.device, key));
      if (!(sameReads && name(writeUnchanged ? 'unchanged' : 'kept'))) fail(`device key ${key}: ${String(was.device[key])} before, ${String(is.device[key])} now`);
    }
    for (const key of [...new Set([...Object.keys(was.file), ...Object.keys(is.file)])].filter((each) => !sameValue(was.file[each], is.file[each]))) {
      const known = SYNCED_KEYS.includes(key);
      const sameReads = known && sameValue(readsOf(SYNCED_ROWS, was.file, key), readsOf(SYNCED_ROWS, is.file, key));
      const partedName = NAMES.find((each) => keysOf(each).includes(key) && parted.has(each));
      const partedBy = partedKeys.get(key) ?? (partedName ? parted.get(partedName) : undefined);
      if (!(sameReads && name('kept')) && !(partedBy && name(partedBy))) fail(`file key ${key}: ${JSON.stringify(was.file[key])} before, ${JSON.stringify(is.file[key])} now`);
    }
    for (const each of NAMES.filter((pref) => was.reads[pref] !== is.reads[pref])) {
      const keys = keysOf(each);
      const arrived: Change | null = step.kind !== 'arrive' ? null : keys.some((key) => unsavedNoChange.has(key)) ? 'unchanged' : keys.some((key) => readAsOther.has(key)) ? 'kept' : null;
      const change = arrived ?? parted.get(each) ?? (malformedRead(each, was.reads[each]!) ? 'malformed' : null);
      if (change && name(change)) parted.set(each, change);
      else fail(`${each} reads ${was.reads[each]} before, ${is.reads[each]} now`);
    }
    for (const each of NAMES) if (was.reads[each] === is.reads[each]) parted.delete(each);
    // What arrived parts in memory first; only a save shows whether the files came together again.
    if (step.kind === 'wait' || step.kind === 'restart') for (const key of [...partedKeys.keys()]) if (sameValue(was.file[key], is.file[key])) partedKeys.delete(key);
    // Each service compares what arrives with what it last saved, so these last until it saves
    if (saves[0] > 0) unsavedNoChange.clear();
    if (saves[1] > 0) readAsOther.clear();
    tally.steps += 1;
    if (named.size > 0) tally.differing += 1;
    for (const change of named) tally.changes[change] += 1;
    previous = [was, is];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('differs from the settings before only by the changes made on purpose, step by step', async () => {
  const tally: Tally = { steps: 0, differing: 0, changes: { unchanged: 0, malformed: 0, kept: 0 }, unexplained: [] };
  for (let seed = 1; seed <= SEQUENCES; seed += 1) await runSequence(seed, tally);
  process.stdout.write(`settings equivalence: ${JSON.stringify({ ...tally, unexplained: tally.unexplained.length })}\n${tally.unexplained.slice(0, 20).join('\n')}\n`);
  expect(tally.steps).toBe(SEQUENCES * STEPS);
  expect(tally.unexplained).toEqual([]);
}, 600_000);
