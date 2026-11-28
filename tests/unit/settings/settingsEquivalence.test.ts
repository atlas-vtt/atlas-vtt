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
 *   form, only the fields a change names): every field the file now holds is the one the file
 *   before holds or one a file read held, and every field it lacks is at its default there.
 * A difference neither side changed since the step before keeps that step's name; nothing else is
 * remembered. `VITE_SETTINGS_EQUIVALENCE_SEQUENCES` sets how many sequences run (300 by default).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { PREFERENCES } from '../../../src/app/services/preferences/preferences';
import { DEVICE_PREFERENCES } from '../../../src/app/services/deviceSettings';
import { sameValue, type AnyPreferenceRow } from '../../../src/app/services/preferences/preferenceRow';
import { DEFAULT_SETTINGS } from '../../../src/app/services/atlasSettings';
import { isRecord } from '../../../src/app/utils/guards';
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

/**
 * Whether a stored value is one Atlas cannot use at all: no record where the row reads a record, no
 * list where it reads a list, or a scalar the row reads as another. A record with fields the row
 * does not read (a newer Atlas's) is usable, so dropping those fields never passes as this.
 */
const unusable = (key: string, stored: unknown): boolean =>
  stored !== undefined && SYNCED_ROWS.some((row) => {
    if (row.keys.length !== 1 || row.keys[0] !== key) return false;
    const read = row.read(() => stored);
    if (Array.isArray(read)) return !Array.isArray(stored);
    return isRecord(read) ? !isRecord(stored) : !sameValue(read, stored);
  });

/**
 * Whether a file the service now read held, in a record preference `name` keeps under `key`, fields
 * its row does not read (a newer Atlas's): the service now keeps them in the record, so the record
 * it holds differs from one that only carries this device's own fields, where the one before kept
 * none. Never for a row that rebases on arrival: what it keeps of another version must stay as arrived.
 */
function newerFieldsHeld(name: PreferenceName, key: string, read: readonly unknown[]): boolean {
  const row = PREFERENCES[name as keyof typeof PREFERENCES] as AnyPreferenceRow | undefined;
  if (!row || row.store !== 'synced' || row.rebasesOnArrival || row.keys.length !== 1) return false;
  return read.some((held) => {
    const own = row.read(() => held);
    return isRecord(held) && isRecord(own) && Object.keys(held).some((field) => !(field in own));
  });
}

interface Tally {
  steps: number;
  differing: number;
  changes: Record<Change, number>;
  unexplained: string[];
}

/**
 * How a file key that differs keeps what the file held: `kept` when every field the file now holds
 * is the one the file before holds, or one a file the service read held (a newer Atlas's field the
 * service before dropped), and every field it lacks the file before holds at its default;
 * `malformed` when the fields it lacks the file before made up from a value Atlas cannot use.
 */
function keptInFile(key: string, before: unknown, now: unknown, read: readonly unknown[]): Change | null {
  const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
  if (now === undefined) return sameValue(before, fallback) ? 'kept' : null;
  if (!isRecord(before) || !isRecord(now)) return null;
  const defaults = isRecord(fallback) ? fallback : {};
  const heldField = (name: string, value: unknown): boolean => read.some((held) => isRecord(held) && sameValue(held[name], value));
  if (!Object.entries(now).every(([name, value]) => sameValue(value, before[name]) || (!(name in before) && heldField(name, value)))) return null;
  if (Object.entries(before).every(([name, value]) => name in now || sameValue(value, defaults[name]))) return 'kept';
  return read.some((held) => unusable(key, held)) ? 'malformed' : null;
}

async function runSequence(seed: number, tally: Tally): Promise<void> {
  const random = seeded(seed);
  const file = randomFile(random, SYNCED_KEYS);
  const device = randomDevice(random, DEVICE_KEYS);
  const before = new Side(true, file, device);
  const now = new Side(false, file, device);
  await before.start();
  await now.start();
  /** Keys the service before rewrote with a write that changed nothing, since it last saved: what it carries over an arriving file. */
  const noChangeBefore = new Map<string, Change>();
  /** The file the service now read last (at the start, from another device, or at a restart), and every value each key held in a file it read. */
  let held: Record<string, unknown> = {};
  const everHeld = new Map<string, unknown[]>();
  const hold = (read: Record<string, unknown>): void => { held = { ...read }; for (const [key, value] of Object.entries(read)) everHeld.set(key, [...(everHeld.get(key) ?? []), value]); };
  hold({ ...(file as Record<string, unknown> | null) });
  /** What explained each difference of the step before; a difference neither side changed since keeps it. */
  let explainedReads = new Map<PreferenceName, Change>();
  let explainedFile = new Map<string, Change>();
  let previous = [before.snapshot(), now.snapshot()] as const;
  let touched: string[] = [];
  for (let index = 0; index < STEPS; index += 1) {
    const step = randomStep(random, NAMES, SYNCED_KEYS, previous[1].file, touched);
    await before.step(step);
    await now.step(step);
    const [was, is] = [before.snapshot(), now.snapshot()];
    const named = new Set<Change>();
    const name = (change: Change): true => { named.add(change); return true; };
    const fail = (what: string): void => { tally.unexplained.push(`sequence ${seed} step ${index} (${step.kind}${step.kind === 'write' ? ` ${step.name} ${JSON.stringify(step.value)}` : ''}): ${what}`); };
    const heard = [was.heard - previous[0].heard, is.heard - previous[1].heard];
    const saves = [was.saves - previous[0].saves, is.saves - previous[1].saves];
    const written = step.kind === 'write' ? step.name : null;
    // The service now told no one and stored nothing. `unchanged` when the one before reads the same as
    // well; `malformed` when what it read before was a value Atlas cannot use, which its write replaced
    const nowStill = written !== null && heard[1] === 0 && sameValue(is.device, previous[1].device);
    const writeChange: Change | null = !nowStill || written === null ? null
      : was.reads[written] === previous[0].reads[written] ? 'unchanged'
        : malformedRead(written, previous[0].reads[written]!) ? 'malformed' : null;
    if (writeChange && written !== null && heard[0] > 0) keysOf(written).forEach((key) => noChangeBefore.set(key, writeChange));
    if (step.kind === 'arrive' && isRecord(step.file)) hold(step.file);
    if (step.kind === 'restart') hold(is.file);
    const readsParted = new Map<PreferenceName, Change>();
    const fileParted = new Map<string, Change>();

    for (const each of NAMES.filter((pref) => was.reads[pref] !== is.reads[pref])) {
      const keys = keysOf(each);
      const unchangedSince = was.reads[each] === previous[0].reads[each] && is.reads[each] === previous[1].reads[each];
      const change: Change | null = malformedRead(each, was.reads[each]!) ? 'malformed'
        : unchangedSince && explainedReads.has(each) ? explainedReads.get(each)!
          : step.kind === 'arrive' && keys.some((key) => noChangeBefore.has(key)) ? noChangeBefore.get(keys.find((key) => noChangeBefore.has(key))!)!
            : step.kind === 'arrive' && keys.some((key) => unusable(key, previous[1].file[key]) || newerFieldsHeld(each, key, everHeld.get(key) ?? [])) ? 'kept'
              : null;
      if (change && name(change)) readsParted.set(each, change);
      else fail(`${each} reads ${was.reads[each]} before, ${is.reads[each]} now`);
    }
    if (heard[0] !== heard[1]) {
      const parted = written ? explainedReads.get(written) : undefined;
      if (!(writeChange && heard[0] > heard[1] && name(writeChange)) && !(parted && name(parted))) fail(`told listeners ${heard[0]} times before, ${heard[1]} now`);
    }
    if (saves[0] !== saves[1] && !(saves[0] > saves[1] && noChangeBefore.size > 0 && [...new Set(noChangeBefore.values())].every(name))) fail(`saved ${saves[0]} times before, ${saves[1]} now`);
    for (const key of DEVICE_KEYS.filter((each) => !sameValue(was.device[each], is.device[each]))) {
      const sameReads = sameValue(readsOf(DEVICE_ROWS, was.device, key), readsOf(DEVICE_ROWS, is.device, key));
      if (!(sameReads && name(writeChange ?? 'kept'))) fail(`device key ${key}: ${String(was.device[key])} before, ${String(is.device[key])} now`);
    }
    for (const key of [...new Set([...Object.keys(was.file), ...Object.keys(is.file)])].filter((each) => !sameValue(was.file[each], is.file[each]))) {
      const unchangedSince = sameValue(was.file[key], previous[0].file[key]) && sameValue(is.file[key], previous[1].file[key]);
      const partedPref = NAMES.find((each) => keysOf(each).includes(key) && (readsParted.has(each) || explainedReads.has(each)));
      // Left as read, or changed to the same fields: either way the file keeps what it held, and reads as the file before does
      const asRead = sameValue(is.file[key], held[key]) && sameValue(readsOf(SYNCED_ROWS, was.file, key), readsOf(SYNCED_ROWS, is.file, key));
      const fields = SYNCED_KEYS.includes(key) ? keptInFile(key, was.file[key], is.file[key], everHeld.get(key) ?? []) : null;
      const change: Change | null = SYNCED_KEYS.includes(key) && asRead ? 'kept' : fields ? fields
        : unchangedSince && explainedFile.has(key) ? explainedFile.get(key)!
          : saves[0] > 0 && noChangeBefore.has(key) ? noChangeBefore.get(key)!
            : partedPref ? (readsParted.get(partedPref) ?? explainedReads.get(partedPref))!
              : null;
      if (change && name(change)) fileParted.set(key, change);
      else fail(`file key ${key}: ${JSON.stringify(was.file[key])} before, ${JSON.stringify(is.file[key])} now`);
    }
    if (saves[0] > 0) noChangeBefore.clear();
    if (step.kind === 'write') touched = [...keysOf(step.name)];
    explainedReads = readsParted;
    explainedFile = fileParted;
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
