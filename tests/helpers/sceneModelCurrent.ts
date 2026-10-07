import { activeLights, engineLight } from '../../src/app/vision/lightSources';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import { GM_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';

/** Where the modules under test live, for a control that swaps one. The tests that use them lie as deep as this file. */
export const LIGHT_SOURCES = '../../src/app/vision/lightSources';
export const LIGHT_REACHES = '../../src/app/vision/lightReaches';

export type Picture = 'players' | 'GM';

/**
 * The scene model under test, made the way the lighting renderer makes it. The comparisons and
 * the controls reach the code only through here, so a module swapped in by a control is the one called.
 */
export const current = {
  builder: (): SceneModelBuilder => new SceneModelBuilder(),
  /** The players' footprints are made with the default, the GM's with the GM's policy. */
  spots: (picture: Picture): SceneSpots => (picture === 'GM' ? new SceneSpots(GM_SIGHT_POLICY) : new SceneSpots()),
  activeLights,
  engineLight,
};
