import { GM_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';
import { activeLights, engineLight } from '../oracles/sceneModelBaseline/lightSources';
import { SceneModelBuilder, SceneSpots, type SceneModel } from '../oracles/sceneModelBaseline/sceneModel';
import type { Picture } from './sceneModelCurrent';

export type Model = SceneModel;
export type Builder = Pick<SceneModelBuilder, 'update' | 'reset'>;
export type Spots = Pick<SceneSpots, 'update'>;

/** A scene model to compare: the code under test, the frozen copy, or a control's tampered one. */
export interface Subject {
  builder(): Builder;
  spots(picture: Picture): Spots;
}

/** The scene model as it was before it moved: frozen copies, made the way the lighting renderer made it. */
export const frozen = {
  builder: (): SceneModelBuilder => new SceneModelBuilder(),
  spots: (picture: Picture): SceneSpots => (picture === 'GM' ? new SceneSpots(GM_SIGHT_POLICY) : new SceneSpots()),
  activeLights,
  engineLight,
};
