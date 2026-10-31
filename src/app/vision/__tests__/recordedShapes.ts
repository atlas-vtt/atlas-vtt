import { exploredShapes, type ExploredShapes } from '../exploredShapes';

/** What explored memory records, without the points its star-shaped polygons are drawn from (`fans`, tested apart). */
export function recorded(...args: Parameters<typeof exploredShapes>): Omit<ExploredShapes, 'fans'> | null {
  const shapes = exploredShapes(...args);
  if (!shapes) return null;
  const rest: ExploredShapes = { ...shapes };
  delete rest.fans;
  return rest;
}
