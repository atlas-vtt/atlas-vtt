/**
 * The values a rest has changed so far of one character, which each rule reads and moves on, and
 * the changes they add up to: per resource, per row of counters and per condition, from what the
 * character held before the rest to what it holds after, with the rolls that went into each. Pure.
 */

import type { ResourceValue } from '../resources/resourceTypes';
import type { FieldKey, FieldValue, TemplateField } from '../statblocks/model/templateTypes';
import { shownCounterRows, type CounterRow } from '../statblocks/values/counterValues';
import { spentRows } from './restCounters';
import type { CharacterChanges, RestChange, RestChangeTarget, RestCharacter, RestMetric, RestRoll } from './restTypes';

type Metric<K extends RestMetric['kind']> = Extract<RestMetric, { kind: K }>;

/** The rolls that went into a row of counters, by its stored place. */
export type RowRolls = (row: number) => readonly RestRoll[];

export interface Ledger {
  /** The metric as the rules so far left it. */
  current(metric: RestMetric): RestMetric;
  setResource(metric: Metric<'resource'>, next: ResourceValue, roll: RestRoll | null): void;
  setCounters(metric: Metric<'counters'>, next: FieldValue, rolls: RowRolls): void;
  setCondition(metric: Metric<'condition'>, next: number): void;
  /** Takes `units` from a Spend rule's source. */
  spend(source: RestMetric, units: number): void;
  outcome(): CharacterChanges & { readonly changes: readonly OrderedChange[] };
}

/** A change, with the place of its first touch among every change of the rest (`touched`), so the changes of several characters keep their order. */
export interface OrderedChange extends RestChange {
  readonly order: number;
}

interface Entry {
  order: number;
  target: RestChangeTarget;
  label: string;
  from: number;
  to: number;
  rolls: RestRoll[];
}

const left = (row: CounterRow): number => row.max - row.used;

/** A new ledger of `character`, empty until a rule changes something; `touched` gives each change its place in the rest. */
export function metricChanges(character: Pick<RestCharacter, 'id' | 'name'>, touched: () => number): Ledger {
  const resources = new Map<string, ResourceValue>();
  const counters = new Map<FieldKey, { field: TemplateField; base: FieldValue | undefined; next: FieldValue }>();
  const conditions = new Map<string, number>();
  /** Every metric touched, in the order first touched, with the rolls on it. */
  const entries = new Map<string, Entry>();

  const countersNow = (metric: Metric<'counters'>): FieldValue | undefined => (counters.has(metric.key) ? counters.get(metric.key)!.next : metric.value);

  const entry = (id: string, made: () => Omit<Entry, 'rolls' | 'order'>): Entry => {
    let found = entries.get(id);
    if (!found) entries.set(id, found = { ...made(), order: touched(), rolls: [] });
    return found;
  };

  const ledger: Ledger = {
    current: (metric) => {
      switch (metric.kind) {
        case 'resource': return { ...metric, value: resources.get(metric.key) ?? metric.value };
        case 'counters': return { ...metric, value: countersNow(metric) };
        case 'condition': return { ...metric, value: conditions.get(metric.id) ?? metric.value };
      }
    },
    setResource: (metric, next, roll) => {
      const changed = entry(`resource:${metric.key}`, () => ({ target: { kind: 'resource', key: metric.key }, label: metric.label, from: metric.value.current, to: metric.value.current }));
      changed.to = next.current;
      if (roll) changed.rolls.push(roll);
      resources.set(metric.key, next);
    },
    setCounters: (metric, next, rolls) => {
      const before = shownCounterRows(metric.field, countersNow(metric)) ?? [];
      const after = shownCounterRows(metric.field, next) ?? [];
      const several = before.filter((row) => row.max > 0).length > 1;
      after.forEach((row, index) => {
        const was = before[index];
        if (!was || left(was) === left(row)) return;
        const changed = entry(`counters:${metric.key}:${index}`, () => ({
          target: { kind: 'counters', key: metric.key, row: index },
          label: several ? `${metric.label} ${row.name}` : row.name || metric.label,
          from: left(was),
          to: left(was),
        }));
        changed.to = left(row);
        changed.rolls.push(...rolls(index));
      });
      const base = counters.get(metric.key)?.base ?? metric.value;
      counters.set(metric.key, { field: metric.field, base, next });
    },
    setCondition: (metric, next) => {
      const changed = entry(`condition:${metric.id}`, () => ({ target: { kind: 'condition', id: metric.id }, label: metric.label, from: metric.value, to: metric.value }));
      changed.to = next;
      conditions.set(metric.id, next);
    },
    spend: (source, units) => {
      const now = ledger.current(source);
      if (now.kind === 'resource') {
        const current = now.value.current + (now.definition.direction === 'fills' ? units : -units);
        ledger.setResource(now, { max: now.value.max, current: Math.max(0, Math.min(now.value.max, current)) }, null);
      } else if (now.kind === 'counters') {
        const next = spentRows(now.field, now.value, now.rows, units);
        if (next !== null) ledger.setCounters(now, next, () => []);
      }
    },
    outcome: () => {
      const who = { id: character.id, name: character.name };
      const changes: OrderedChange[] = [...entries.values()].filter((each) => each.from !== each.to).map((each) => ({ ...each, character: who }));
      const changed = new Set(changes.map(({ target }) => `${target.kind}:${'key' in target ? target.key : target.id}`));
      const keep = <V>(map: Map<string, V>, kind: RestChangeTarget['kind']): Map<string, V> =>
        new Map([...map].filter(([key]) => changed.has(`${kind}:${key}`)));
      return { changes, resources: keep(resources, 'resource'), counters: keep(counters, 'counters'), conditions: keep(conditions, 'condition') };
    },
  };
  return ledger;
}
