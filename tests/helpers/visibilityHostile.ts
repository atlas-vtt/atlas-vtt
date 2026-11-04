import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { sealWalls } from '../../src/app/lighting/sealWalls';
import { random, TOLERANCE, wall } from '../../src/app/lighting/__tests__/sealFixtures';

/** Wall piles like those the sealing suites guard against, at a tenth of their size, sealed, with places to look at them from. */
export interface HostileScene {
  name: string;
  walls: readonly WallSegment[];
  origins: Point[];
}

function scene(name: string, drawn: WallSegment[], origins: Point[]): HostileScene {
  return { name, walls: sealWalls(drawn, TOLERANCE), origins };
}

/** Two thousand walls that start within six pixels of each other and run apart. */
function pile(): HostileScene {
  const rand = random(11);
  const drawn = Array.from({ length: 2000 }, (_, i) => {
    const angle = rand() * Math.PI * 2, x = 500 + rand() * 6, y = 500 + rand() * 6;
    return wall(`pile${i}`, x, y, x + Math.cos(angle) * 200, y + Math.sin(angle) * 200);
  });
  return scene('two thousand walls from six pixels', drawn, [{ x: 900, y: 520 }, { x: 600, y: 760 }]);
}

/** Two thousand short walls with both ends in twelve pixels. */
function shortPile(): HostileScene {
  const rand = random(13);
  const drawn = Array.from({ length: 2000 }, (_, i) => wall(`short${i}`, 500 + rand() * 12, 500 + rand() * 12, 500 + rand() * 12, 500 + rand() * 12));
  return scene('two thousand short walls in twelve pixels', drawn, [{ x: 506, y: 506 }, { x: 800, y: 300 }]);
}

/** Two thousand walls from one point, their far ends a pixel apart on a circle. */
function star(): HostileScene {
  const drawn = Array.from({ length: 2000 }, (_, i) => {
    const angle = (i / 2000) * Math.PI * 2;
    return wall(`ray${i}`, 1000, 1000, 1000 + Math.cos(angle) * 318, 1000 + Math.sin(angle) * 318);
  });
  return scene('two thousand walls from one point', drawn, [{ x: 1100, y: 1003 }, { x: 1500, y: 1000 }, { x: 1000.5, y: 999.7 }]);
}

/** A cave drawn as 1,980 segments of three pixels, in rows three pixels apart. */
function cave(): HostileScene {
  const drawn = Array.from({ length: 20 }, (_, row) => Array.from({ length: 99 }, (_, i) => wall(`cave${row}-${i}`, 100 + i * 3, 100 + row * 3 + (i % 2), 103 + i * 3, 100 + row * 3 + ((i + 1) % 2)))).flat();
  return scene('a cave of 1,980 short segments', drawn, [{ x: 250, y: 130 }, { x: 300, y: 400 }]);
}

/** Four hundred long walls a hair apart, and four hundred walls that end beside all of them. */
function beside(): HostileScene {
  const long = Array.from({ length: 400 }, (_, i) => wall(`long${i}`, 0, 500 + i * 0.0015, 1000, 500 + i * 0.0015));
  const stems = Array.from({ length: 400 }, (_, i) => wall(`stem${i}`, 100 + i * 0.1, 300, 100 + i * 0.1, 499.5));
  return scene('four hundred long walls beside four hundred ends', [...long, ...stems], [{ x: 500, y: 200 }, { x: 900, y: 520 }]);
}

/** The hostile piles, each built only when asked for: sealing them takes a while. */
export const HOSTILE_SCENES: [string, () => HostileScene][] = [['walls from six pixels', pile], ['short walls in twelve pixels', shortPile], ['walls from one point', star], ['a cave of short segments', cave], ['long walls beside many ends', beside]];
