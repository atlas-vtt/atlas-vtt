import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { CAVE_PARTS, drawnCaveParts } from '../../../../src/app/dungeons/render/cave/caveArt';
import { CAVE_GROUND } from '../../../../src/app/dungeons/render/cave/ground';
import { CAVE_WAYS } from '../../../../src/app/dungeons/render/cave/ways';
import { renderMapSvg } from '../../../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';

describe('the cave art registry', () => {
  let floor: typeof CAVE_GROUND.floor;
  let narrows: typeof CAVE_WAYS.narrows;
  beforeEach(() => {
    floor = CAVE_GROUND.floor;
    narrows = CAVE_WAYS.narrows;
  });
  afterEach(() => {
    CAVE_GROUND.floor = floor;
    CAVE_WAYS.narrows = narrows;
  });

  it('names as drawn exactly the parts registered, in the order of CAVE_PARTS', () => {
    const registered = CAVE_PARTS.filter((part) => (part in CAVE_GROUND ? CAVE_GROUND[part as keyof typeof CAVE_GROUND] : CAVE_WAYS[part as keyof typeof CAVE_WAYS]) !== undefined);
    expect(drawnCaveParts()).toEqual(registered);
    expect(CAVE_PARTS).toHaveLength(9);
  });

  it('is asked on a cave floor, in either painter, and never on a built one', () => {
    const stone = vi.fn();
    const engraved = vi.fn();
    const narrows = vi.fn();
    CAVE_GROUND.floor = { stone, engraved };
    CAVE_WAYS.narrows = narrows;
    expect(drawnCaveParts()).toEqual(expect.arrayContaining(['floor', 'narrows']));
    const cave = generateDungeon({ seed: 606, theme: 'cavern', tags: ['medium'], floors: 1 });
    const fortress = generateDungeon({ seed: 606, theme: 'fortress', tags: ['medium'], floors: 1 });
    renderMapSvg(fortress, dungeonStyle('masonry'), DEFAULT_VIEW, { pxPerCell: 20 });
    renderMapSvg(fortress, dungeonStyle('print'), DEFAULT_VIEW, { pxPerCell: 20 });
    expect(stone).not.toHaveBeenCalled();
    expect(engraved).not.toHaveBeenCalled();
    expect(narrows).not.toHaveBeenCalled();
    renderMapSvg(cave, dungeonStyle('masonry'), DEFAULT_VIEW, { pxPerCell: 20 });
    renderMapSvg(cave, dungeonStyle('print'), DEFAULT_VIEW, { pxPerCell: 20 });
    expect(stone.mock.calls.length + engraved.mock.calls.length).toBe(2);
    expect(stone).toHaveBeenCalled();
    expect(engraved).toHaveBeenCalled();
    expect(narrows).toHaveBeenCalledTimes(2);
  });
});
