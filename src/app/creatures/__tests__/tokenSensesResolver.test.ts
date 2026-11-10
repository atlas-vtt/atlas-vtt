import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SENSES } from '../../gameSystems/senses';
import type { TokenVision } from '../../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import type { IndexedCreature } from '../CreatureIndex';
import { tokenSensesResolver, type CreatureSource, type SenseRules } from '../tokenSensesResolver';

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const PATHFINDER = BUILT_IN_SENSES['builtin:pathfinder2e']!;
const FEET: SenseRules = { definitions: DND, unit: { unitType: 'feet', ruleDistance: 5 } };

const GOBLIN = 'Bestiary/Goblin.md';
const ORC = 'Bestiary/Orc.md';

function named(senses: readonly TokenSense[], definitions: readonly SenseDefinition[] = DND): Array<[string, number?]> {
  return senses.map((sense) => {
    const name = definitions.find((definition) => definition.id === sense.id)?.name ?? `? ${sense.id}`;
    return sense.range === undefined ? [name] : [name, sense.range];
  });
}

function token(statblockPath: string | undefined, vision: TokenVision = { enabled: true }): { vision: TokenVision; statblockPath?: string } {
  return { vision, ...(statblockPath && { statblockPath }) };
}

/** An index whose entries a test sets by hand; like the real one, it tells its listeners when a request starts. */
function fakeIndex(): CreatureSource & {
  set: (path: string, senses: string | null) => void;
  put: (path: string, senses: string | null) => void;
  tell: () => void;
  request: ReturnType<typeof vi.fn>;
  listeners: Set<() => void>;
} {
  const entries = new Map<string, IndexedCreature | null>();
  const listeners = new Set<() => void>();
  const tell = (): void => { for (const listener of [...listeners]) listener(); };
  const put = (path: string, senses: string | null): void => {
    entries.set(path, senses === null ? null : { path, fields: { senses }, templateId: null, meanings: {}, lookName: null });
  };
  return {
    listeners,
    put,
    tell,
    get: (path) => entries.get(path),
    request: vi.fn(() => tell()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (path, senses) => {
      put(path, senses);
      tell();
    },
  };
}

describe('tokenSensesResolver', () => {
  it('never asks for the statblock of a token that has its own senses and its own sight range, or no statblock', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    const own = [{ id: DND[0]!.id, range: 30 }];
    expect(resolver.visionOf(token(GOBLIN, { enabled: true, range: 60, senses: own }))).toMatchObject({ senses: own, source: 'token', sightRange: 60, pending: false });
    expect(named(resolver.sensesOf(token(GOBLIN, { enabled: true, range: 60, darkvision: 30 })))).toEqual([['Darkvision', 30]]);
    expect(resolver.sensesOf(token(undefined))).toEqual([]);
    expect(index.request).not.toHaveBeenCalled();
  });

  it('asks for the statblock of a token with its own senses but no sight range, since the statblock may limit its sight', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    const own = [{ id: DND[0]!.id, range: 30 }];
    expect(resolver.visionOf(token(GOBLIN, { enabled: true, senses: own }))).toMatchObject({ senses: own, source: 'token', pending: true });
    expect(index.request).toHaveBeenCalledWith([GOBLIN]);
    index.set(GOBLIN, 'tremorsense 60 ft. (blind beyond this radius)');
    expect(resolver.visionOf(token(GOBLIN, { enabled: true, senses: own }))).toMatchObject({ senses: own, source: 'token', pending: false, sightRange: 0 });
  });

  it('is pending for a token whose statblock is not read yet', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    expect(resolver.visionOf(token(GOBLIN))).toMatchObject({ senses: [], source: 'pending', pending: true });
    index.set(GOBLIN, null);
    expect(resolver.visionOf(token(GOBLIN))).toMatchObject({ senses: [], source: 'none', pending: false });
  });

  it('asks the index for the statblock of a token that follows it, and has no senses until it is read', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    expect(resolver.sensesOf(token(GOBLIN))).toEqual([]);
    expect(index.request).toHaveBeenCalledWith([GOBLIN]);
    index.set(GOBLIN, 'darkvision 60 ft., passive Perception 9');
    expect(named(resolver.sensesOf(token(GOBLIN)))).toEqual([['Darkvision', 60]]);
    expect(index.request).toHaveBeenCalledTimes(1);
  });

  it('reads the rules anew on every call, so a changed collection shows at the next rebuild', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft., scent (imprecise) 30 feet');
    let rules = FEET;
    const resolver = tokenSensesResolver(index, { get: () => rules });
    expect(named(resolver.sensesOf(token(GOBLIN)))).toEqual([['Darkvision', 60]]);
    rules = { definitions: PATHFINDER, unit: { unitType: 'meters', ruleDistance: 1.5 } };
    expect(named(resolver.sensesOf(token(GOBLIN)), PATHFINDER)).toEqual([['Darkvision', 18], ['Scent', 9]]);
  });

  it('says where a statblock makes a creature blind beyond its senses', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'blindsight 30 ft. (blind beyond this radius)');
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    expect(resolver.visionOf(token(GOBLIN))).toMatchObject({ source: 'statblock', blindBeyond: true, sightRange: 30 });
    expect(resolver.visionOf(token(GOBLIN, { enabled: true, senses: [] }))).toMatchObject({ senses: [], source: 'token', sightRange: 30 });
    expect(resolver.visionOf(token(GOBLIN, { enabled: true, range: 60 })).sightRange).toBe(60);
  });

  it('tells its listeners when a statblock it was asked about is read or changes, and only then', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    const listener = vi.fn();
    resolver.subscribe(listener);

    resolver.sensesOf(token(GOBLIN));
    // The request itself changes the index's pending state, not the statblock.
    expect(listener).not.toHaveBeenCalled();

    index.set(ORC, 'darkvision 60 ft.');
    expect(listener).not.toHaveBeenCalled();

    index.set(GOBLIN, 'darkvision 60 ft.');
    expect(listener).toHaveBeenCalledTimes(1);
    resolver.sensesOf(token(GOBLIN));

    index.set(ORC, 'darkvision 120 ft.');
    expect(listener).toHaveBeenCalledTimes(1);

    index.set(GOBLIN, 'darkvision 120 ft.');
    expect(listener).toHaveBeenCalledTimes(2);
    index.set(GOBLIN, null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('listens to the index only while someone listens to it', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    resolver.sensesOf(token(GOBLIN));
    expect(index.listeners.size).toBe(0);
    const first = resolver.subscribe(vi.fn());
    const second = resolver.subscribe(vi.fn());
    expect(index.listeners.size).toBe(1);
    first();
    expect(index.listeners.size).toBe(1);
    second();
    expect(index.listeners.size).toBe(0);
  });

  it('notices a statblock that changed while nobody listened', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft.');
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    resolver.sensesOf(token(GOBLIN));
    index.set(GOBLIN, 'darkvision 120 ft.');
    const listener = vi.fn();
    resolver.subscribe(listener);
    index.set(ORC, 'tremorsense 60 ft.');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still tells its listeners when another reader saw the new statblock before the index announced it', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft.');
    const resolver = tokenSensesResolver(index, { get: () => FEET });
    const sight = vi.fn();
    resolver.subscribe(sight);
    resolver.sensesOf(token(GOBLIN));

    index.put(GOBLIN, 'darkvision 120 ft.');
    // Edit Token reads the token before the index has told anyone.
    expect(named(resolver.sensesOf(token(GOBLIN)))).toEqual([['Darkvision', 120]]);
    index.tell();
    expect(sight).toHaveBeenCalledTimes(1);
  });
});

describe('tokenSensesResolver on changing rules', () => {
  function source(initial: SenseRules): { get: () => SenseRules; subscribe: (listener: () => void) => () => void; change: (rules: SenseRules) => void; listeners: Set<() => void> } {
    let rules = initial;
    const listeners = new Set<() => void>();
    return {
      listeners,
      get: () => rules,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
      change: (next) => {
        rules = next;
        for (const listener of [...listeners]) listener();
      },
    };
  }

  it('tells its listeners when the collection\'s senses or its unit change', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft.');
    const rules = source(FEET);
    const resolver = tokenSensesResolver(index, rules);
    const sight = vi.fn();
    resolver.subscribe(sight);
    resolver.sensesOf(token(GOBLIN));

    rules.change({ definitions: PATHFINDER, unit: FEET.unit });
    expect(sight).toHaveBeenCalledTimes(1);
    rules.change({ definitions: PATHFINDER, unit: { unitType: 'meters', ruleDistance: 1.5 } });
    expect(sight).toHaveBeenCalledTimes(2);
    rules.change({ definitions: PATHFINDER, unit: { unitType: 'meters', ruleDistance: 2 } });
    expect(sight).toHaveBeenCalledTimes(3);
  });

  it('stays quiet when a settings change leaves the senses and the unit as they were', () => {
    const index = fakeIndex();
    const rules = source(FEET);
    const resolver = tokenSensesResolver(index, rules);
    const sight = vi.fn();
    resolver.subscribe(sight);
    resolver.sensesOf(token(GOBLIN));
    rules.change({ definitions: [...DND], unit: { ...FEET.unit } });
    expect(sight).not.toHaveBeenCalled();
  });

  it('stays quiet before anyone asked for senses, and listens only while someone listens to it', () => {
    const index = fakeIndex();
    const rules = source(FEET);
    const resolver = tokenSensesResolver(index, rules);
    const sight = vi.fn();
    const stop = resolver.subscribe(sight);
    expect(rules.listeners.size).toBe(1);
    rules.change({ definitions: PATHFINDER, unit: FEET.unit });
    expect(sight).not.toHaveBeenCalled();
    stop();
    expect(rules.listeners.size).toBe(0);
  });
});
