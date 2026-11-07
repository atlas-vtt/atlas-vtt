import { expect, it } from 'vitest';
import type { RoomProgramme } from '../../../src/app/dungeons/themes/themeTypes';
import { normals } from './dungeonInvariants';
import { coverProblems } from './coverInvariants';
import { isHazard } from './terrainInvariants';
import { type ThemeRun, failuresOf } from './themeRuns';
import { hazardFurnitureProblems, mirrorProblems, physicsProblems, reasonProblems, shapeProblems } from './themeTerrainInvariants';

/** The terrain rules every built theme keeps, held over its runs: each as its own case. */
export function describeThemeTerrain(runs: readonly ThemeRun[], programme: RoomProgramme): void {
  const columns = new Set<string>(programme.rooms.filter((spec) => spec.terrain.columns).map((spec) => spec.id));

  it('holds no hazard in a furnished room and no formal furniture in a hazard room', () => {
    expect(failuresOf(runs, hazardFurnitureProblems)).toEqual([]);
  });

  it('keeps its theme\'s rule of cover: in every room that can hold a fight, or only where a room\'s type places it', () => {
    expect(failuresOf(runs, coverProblems)).toEqual([]);
  });

  it('places hazards within the theme\'s band', () => {
    const plain = runs.filter((run) => !run.model.tags.includes('ruined'));
    const hazards = plain.reduce((sum, run) => sum + run.model.floors.reduce((s, f) => s + f.terrain.filter((p) => isHazard(p) && f.rooms[p.room]?.type && !f.rooms[p.room]?.boss).length, 0), 0);
    const rooms = plain.reduce((sum, run) => sum + run.model.floors.reduce((s, f) => s + normals(f).length, 0), 0);
    const band = programme.rooms.some((spec) => spec.terrain.hazards?.length && !spec.ruinedOnly) ? 0.08 : 0;
    expect(hazards / rooms).toBeLessThanOrEqual(band);
  });

  it('keeps columns to the types that take them', () => {
    expect(failuresOf(runs, (m) => m.floors.flatMap((floor) => floor.rooms.filter((room) => room.colonnade && room.type && !columns.has(room.type)).map((room) => `a colonnade in a ${room.type}`)))).toEqual([]);
  });

  it('gives every feature and every pool a reason of its room type', () => {
    expect(failuresOf(runs, (m) => reasonProblems(m, programme))).toEqual([]);
  });

  it('never lays a hazard in a throne room, ballroom or bedroom', () => {
    const calm = new Set(['throne-room', 'ballroom', 'master-bedroom', 'bedroom']);
    expect(failuresOf(runs, (m) => m.floors.flatMap((floor) => floor.terrain.filter((p) => isHazard(p) && calm.has(floor.rooms[p.room]?.type ?? '')).map((p) => `${p.kind} in a ${floor.rooms[p.room]?.type}`)))).toEqual([]);
  });

  it('keeps holes and molten channels clear of standing water', () => {
    expect(failuresOf(runs, physicsProblems)).toEqual([]);
  });

  it('shapes natural features irregularly, built openings along the walls, and mirrors no natural feature', () => {
    expect(failuresOf(runs, (m) => [...shapeProblems(m, programme), ...mirrorProblems(m)])).toEqual([]);
  });
}
