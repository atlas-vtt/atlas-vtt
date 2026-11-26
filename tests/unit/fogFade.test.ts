import { describe, expect, it } from 'vitest';
import { fogPictureStep, type FogPictureChange } from '../../src/app/fog/fogFade';

/** An edit of the fog the picture shows, where nothing stands against a fade. */
const EDIT: FogPictureChange = { edit: true, continues: true, sameFog: false, stroke: false, canMix: true, reducedMotion: false };

describe('whether a change of the fog fades', () => {
  it('fades an edit of the fog the picture shows', () => {
    expect(fogPictureStep(EDIT)).toBe('fade');
  });

  it('shows the fog at once, and ends a fade that runs, where it is not an edit: a load, another level', () => {
    expect(fogPictureStep({ ...EDIT, edit: false })).toBe('cut');
  });

  it('shows the first picture of a map or level, and one on a canvas of another size, at once', () => {
    expect(fogPictureStep({ ...EDIT, continues: false })).toBe('cut');
    expect(fogPictureStep({ ...EDIT, continues: false, sameFog: true })).toBe('cut');
    expect(fogPictureStep({ ...EDIT, continues: false, stroke: true })).toBe('cut');
  });

  it('shows an edit at once with reduced motion, and where two pictures cannot be mixed', () => {
    expect(fogPictureStep({ ...EDIT, reducedMotion: true })).toBe('cut');
    expect(fogPictureStep({ ...EDIT, canMix: false })).toBe('cut');
  });

  it('starts no fade for a stroke: committed it is what the canvas shows, dropped it goes at once, and a fade that runs goes on', () => {
    expect(fogPictureStep({ ...EDIT, stroke: true })).toBe('follow');
    expect(fogPictureStep({ ...EDIT, stroke: true, sameFog: true, edit: false })).toBe('follow');
  });

  it('starts no fade where the fog is the one shown (another tool, the edge, the map image announced again), and ends none', () => {
    expect(fogPictureStep({ ...EDIT, sameFog: true })).toBe('follow');
    expect(fogPictureStep({ ...EDIT, sameFog: true, edit: false })).toBe('follow');
    expect(fogPictureStep({ ...EDIT, sameFog: true, reducedMotion: true })).toBe('follow');
  });
});
