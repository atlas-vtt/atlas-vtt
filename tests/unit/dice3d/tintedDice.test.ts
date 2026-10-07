import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const painted = vi.hoisted(() => ({ looks: [] as Array<{ body: string | null; ink: string | null }> }));

vi.mock('../../../src/app/dice3d/dieArtwork', async () => {
  const three = await import('three');
  return {
    buildTextures: (_body: number, lookOf: () => { body: string | null; ink: string | null } = () => ({ body: null, ink: null })): unknown => {
      painted.looks.push(lookOf());
      return { map: new three.Texture(), bumpMap: new three.Texture(), redraw: (): void => { painted.looks.push(lookOf()); } };
    },
    diceArtworkReady: (): boolean => true,
    loadDiceArtwork: (): Promise<void> => Promise.resolve(),
  };
});

import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { dieAssets, dieVariantAssets, refreshDieArtwork, releaseDieVariants, tintedLook } from '../../../src/app/dice3d/dieMesh';
import { activeLook } from '../../../src/app/dice3d/dieSkin';
import { GhostTrail } from '../../../src/app/dice3d/ghostTrail';

describe('tagged dice in 3D', () => {
  it('plans each die in its tag\'s colour: a d100\'s two dice, a d2 on its d6, explosions; nothing for a bad colour', () => {
    const scene = sceneFromRolls([
      { max: 6, value: 6, color: '#DD3333' }, { max: 6, value: 2, exploded: true, color: '#dd3333' },
      { max: 2, value: 1, color: '#3366dd' }, { max: 20, value: 4, color: 'red' }, { max: 8, value: 3 },
    ])!;
    expect(scene.plan.map((die) => die.tint)).toEqual(['#dd3333', '#dd3333', '#3366dd', undefined, undefined]);
    expect(sceneFromRolls([{ max: 100, value: 42, color: '#00aa00' }])!.plan.map((die) => die.tint)).toEqual(['#00aa00', '#00aa00']);
  });

  it('keeps the shared material for untagged dice and gives each colour of a body its own, painted in it', () => {
    expect(dieVariantAssets(6, null, null)).toBe(dieAssets(6));
    const red = dieVariantAssets(6, null, '#dd3333');
    expect(red).not.toBe(dieAssets(6));
    expect(red.geometry).toBe(dieAssets(6).geometry);
    expect(red.material).not.toBe(dieAssets(6).material);
    expect(dieVariantAssets(6, null, '#dd3333')).toBe(red);
    expect(dieVariantAssets(6, null, '#3366dd')).not.toBe(red);
    expect(dieVariantAssets(20, null, '#dd3333')).not.toBe(red);
    expect(painted.looks.at(-1)).toMatchObject({ body: '#dd3333' });
    releaseDieVariants();
  });

  it('paints a tinted body with numerals that read on it, over the active look or a look of its own', () => {
    expect(tintedLook(activeLook(), '#111111')).toMatchObject({ body: '#111111', ink: expect.any(String) });
    expect(tintedLook(activeLook(), null)).toBe(activeLook());
    const own = { ...activeLook(), lookId: 'ext:fire', body: '#ffffff' };
    dieVariantAssets(8, { key: 'ext:fire', look: () => own }, '#3366dd');
    expect(painted.looks.at(-1)).toMatchObject({ lookId: 'ext:fire', body: '#3366dd' });
    const before = painted.looks.length;
    refreshDieArtwork();
    expect(painted.looks.length).toBeGreaterThan(before);
    releaseDieVariants();
  });

  it('keeps at most 32, giving back the one used longest ago, and gives all back with the stage pools', () => {
    const first = dieVariantAssets(4, null, '#000001');
    const dispose = vi.spyOn(first.material, 'dispose');
    for (let i = 2; i <= 33; i++) dieVariantAssets(4, null, `#0000${i.toString(16).padStart(2, '0')}`);
    expect(dispose).toHaveBeenCalledTimes(1);
    const last = dieVariantAssets(4, null, '#000021');
    const lastDispose = vi.spyOn(last.material, 'dispose');
    releaseDieVariants();
    expect(lastDispose).toHaveBeenCalledTimes(1);
  });

  it('gives back the waiting ghost copies of a material that is given back', () => {
    const scene = new THREE.Scene();
    const trail = new GhostTrail(scene);
    const assets = dieVariantAssets(6, null, '#dd3333');
    trail.addChain(assets, 2);
    const ghost = scene.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const copyDispose = vi.spyOn(ghost.material as THREE.Material, 'dispose');
    trail.clear();
    releaseDieVariants();
    expect(copyDispose).toHaveBeenCalled();
  });
});
