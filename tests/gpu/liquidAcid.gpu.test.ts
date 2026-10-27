/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { DUNGEON_STYLES } from '../../src/app/dungeons/styleCatalog';
import { acidPng, acidScene } from './liquidAcidHarness';

const capture = import.meta.env.VITE_ACID_CAPTURE as string | undefined;
const only = import.meta.env.VITE_ACID_LOOK as string | undefined;
// Longer proofs show a whole slow bubble lifecycle; the routine gate stays short.
const frames = import.meta.env.VITE_ACID_FULL_CYCLE ? 360 : 90;

describe('acid in the real generated map artwork', () => {
  for (const { id } of DUNGEON_STYLES) for (const mono of [false, true]) {
    const name = `${id}${mono ? '-mono' : ''}`;
    it(`moves quietly over ${name} and holds its poster`, async () => {
      if (only && !only.split(',').includes(name)) return;
      const scene = await acidScene(id, mono);
      try {
        const poster = scene.frame(0);
        if (capture) await acidPng(poster, `${capture}/${name}/still`);
        let last = poster;
        let changed = 0;
        for (let f = 0; f < frames; f++) {
          const pixels = scene.frame(f / 30);
          if (capture) await acidPng(pixels, `${capture}/${name}/frames/${String(f).padStart(3, '0')}`);
          for (let k = 0; k < pixels.length; k += 4) changed += Math.abs(pixels[k]! - last[k]!);
          last = pixels;
        }
        expect(changed).toBeGreaterThan(100);
        scene.layer.setMode('poster');
        expect(scene.frame(frames / 30)).toEqual(poster);
      } finally { scene.destroy(); }
    });
  }
});
