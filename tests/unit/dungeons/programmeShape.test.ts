import { describe, expect, it } from 'vitest';
import { PROP_SPECS } from '../../../src/app/dungeons/props/catalogue';
import { FEATURES } from '../../../src/app/dungeons/themes/features';
import { ALL_PROP_KINDS, type PropKind } from '../../../src/app/dungeons/props/propKinds';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import { CAVERN_PROGRAMME } from '../../../src/app/dungeons/themes/cavern';
import { MANSION } from '../../../src/app/dungeons/themes/mansion';
import type { Piece, RoomProgramme, RoomTypeSpec } from '../../../src/app/dungeons/themes/themeTypes';

/** Rooms built for what they are, so they never take a hazard. */
const FORMAL = ['throne-room', 'chapel', 'solar', 'chamber', 'library', 'kitchen', 'great-hall', 'dining-room', 'bedroom', 'master-bedroom', 'drawing-room'];
/** Hazard types whose built piece stands only where the hazard was not placed. */
const BUILT_WITHOUT_HAZARD = ['cistern'];

/** Climax types of which the facts allow one at most: their weights stand in for each other. */
const EITHER: Readonly<Record<string, readonly string[]>> = { cavern: ['den', 'chief-den'] };

const PROGRAMMES: [string, RoomProgramme, readonly (readonly [string, string])[]][] = [
  ['fortress', FORTRESS, [['kitchen', 'chapel'], ['kitchen', 'solar'], ['gaol', 'solar'], ['garderobe', 'kitchen']]],
  ['mansion', MANSION, [['kitchen', 'drawing-room'], ['kitchen', 'master-bedroom']]],
  ['cavern', CAVERN_PROGRAMME, []],
];

function piecesOf(spec: RoomTypeSpec): Piece[] {
  const { defining, pieces } = spec.furnish;
  return [...(defining ? [defining] : []), ...pieces];
}

function kindsOf(programme: RoomProgramme): PropKind[] {
  return programme.rooms.flatMap((spec) => piecesOf(spec).flatMap((p) => [p.kind, ...(p.parent ? [p.parent] : [])]));
}

describe.each(PROGRAMMES)('the %s programme', (name, programme, apartPairs) => {
  const ids = new Set(programme.rooms.map((spec) => spec.id));
  const spec = (id: string): RoomTypeSpec | undefined => programme.rooms.find((s) => s.id === id);

  it('names only its own room types', () => {
    const named = [
      ...programme.entrance.map(([id]) => id),
      ...programme.pivot,
      programme.stairs,
      ...programme.climax.map((c) => c.type),
      ...programme.clusters.flatMap((c) => [c.core, ...c.members]),
      ...Object.values(programme.stages).flat(),
      ...programme.filler.map(([id]) => id),
      ...programme.rooms.flatMap((s) => [...(s.next ?? []), ...(s.near ?? []), ...(s.apart ?? [])]),
    ];
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
    expect(ids.size).toBe(programme.rooms.length);
  });

  it('counts sensibly', () => {
    for (const s of programme.rooms) {
      expect(s.count[0], s.id).toBeGreaterThanOrEqual(0);
      expect(s.count[0], s.id).toBeLessThanOrEqual(s.count[1]);
      if (s.required) expect(s.count[0], s.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('weighs its climax', () => {
    for (const c of programme.climax) expect(c.weight, c.type).toBeGreaterThan(0);
    const either = EITHER[name] ?? [];
    const alike = programme.climax.filter((c) => either.includes(c.type));
    for (const c of alike) expect(c.weight, c.type).toBe(alike[0]!.weight);
    const sum = programme.climax.filter((c) => !either.includes(c.type)).reduce((s, c) => s + c.weight, 0) + (alike[0]?.weight ?? 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it('keeps hazards and built pieces apart', () => {
    for (const s of programme.rooms) {
      const defining = s.furnish.defining;
      if (s.terrain.hazards?.length && defining && !BUILT_WITHOUT_HAZARD.includes(s.id)) expect(PROP_SPECS[defining.kind].natural, s.id).toBe(true);
    }
    for (const id of FORMAL) expect(spec(id)?.terrain.hazards ?? [], id).toEqual([]);
  });

  it('gives every hole, hazard and standing water a reason of its type', () => {
    for (const s of programme.rooms) {
      const reasons = (s.terrain.features ?? []).map((reason) => FEATURES[reason]);
      const kinds = new Set(reasons.flatMap((reason) => reason.kinds));
      for (const kind of [...(s.terrain.hazards ?? []), ...(s.terrain.holes ?? [])]) expect(kinds.has(kind), `${s.id}: ${kind}`).toBe(true);
      if (s.terrain.water) expect(reasons.some((reason) => reason.water === s.terrain.water), `${s.id}: ${s.terrain.water}`).toBe(true);
    }
  });

  it('uses only catalogue kinds', () => {
    expect(kindsOf(programme).filter((kind) => !ALL_PROP_KINDS.has(kind))).toEqual([]);
  });

  it('lists the never-adjacent pairs both ways', () => {
    for (const [a, b] of apartPairs) {
      expect(spec(a)?.apart ?? [], `${a} apart from ${b}`).toContain(b);
      expect(spec(b)?.apart ?? [], `${b} apart from ${a}`).toContain(a);
    }
  });
});

describe('structure only', () => {
  it('builds statues, busts, fountains, wells, daises and fireplaces, and in a cave what nature made and a fire pit', () => {
    const built = new Set(['dais', 'statue', 'bust', 'fountain', 'well', 'hearth']);
    for (const [name, programme] of PROGRAMMES) {
      const allowed = (kind: PropKind): boolean => (name === 'cavern' ? PROP_SPECS[kind].natural === true || kind === 'campfire' : built.has(kind));
      expect(kindsOf(programme).filter((kind) => !allowed(kind)), name).toEqual([]);
    }
  });
});

describe('the Haunted Mansion programme', () => {
  it('refuses every hazard but the rotted floor of a ruin', () => {
    expect(MANSION.rooms.filter((spec) => spec.terrain.hazards?.length).map((spec) => spec.id)).toEqual(['collapsed-room']);
    expect(MANSION.rooms.find((spec) => spec.id === 'collapsed-room')?.ruinedOnly).toBe(true);
  });

  it('offers the ballroom as climax only on the entrance floor', () => {
    expect(MANSION.climax.find((c) => c.type === 'ballroom')?.onlyOnEntranceFloor).toBe(true);
  });
});
