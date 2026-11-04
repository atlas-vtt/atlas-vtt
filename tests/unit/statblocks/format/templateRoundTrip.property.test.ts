import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import { EVERY_BLOCK_JSON, FIVE_E_2024_JSON, MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { expectSound, fileOf, mulberry32, mutated, pick } from './templateMutations';

const FILES = [
  MARSH_CREATURE_JSON, FIVE_E_2024_JSON, EVERY_BLOCK_JSON,
  ...BUILT_IN_TEMPLATES.map((builtIn) => serializeTemplate(builtIn.template)),
].map(fileOf);
const RUNS = 600;

// Seeded checks with a fixed workload: 3 to 4.5 s on a hosted runner, close to the 5 s default.
describe('serialize ∘ parse on mutated templates', { timeout: 30_000 }, () => {
  it(`is a fixed point after one pass (${RUNS} seeded runs)`, () => {
    const random = mulberry32(0x5eed);
    let written = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const file = mutated(random, pick(random, FILES));
      const options = { allowBuiltIn: true };
      const first = parseTemplate(file, options);
      if (first.template === null) continue;
      expectSound(first.template);
      const once = serializeTemplate(first.template);
      const second = parseTemplate(once, options);
      expect(second.status, `run ${run}`).toBe(first.status);
      if (second.template === null) throw new Error(`run ${run}: the written file no longer reads`);
      expectSound(second.template);
      expect(serializeTemplate(second.template), `run ${run}`).toBe(once);
      written += 1;
    }
    expect(written).toBeGreaterThan(RUNS / 2);
  }, 60_000);

  it('reads the same from the text and from the value', () => {
    const random = mulberry32(0xface);
    for (let run = 0; run < 200; run += 1) {
      const file = mutated(random, pick(random, FILES));
      const fromValue = parseTemplate(file, { allowBuiltIn: true });
      const fromText = parseTemplate(JSON.stringify(file), { allowBuiltIn: true });
      expect(fromText.status, `run ${run}`).toBe(fromValue.status);
      expect(fromText.problems, `run ${run}`).toEqual(fromValue.problems);
      if (fromText.template && fromValue.template) {
        expect(serializeTemplate(fromText.template), `run ${run}`).toBe(serializeTemplate(fromValue.template));
      }
    }
  });

  it('loses nothing of a file it reads without problems', () => {
    const random = mulberry32(0xbead);
    for (let run = 0; run < 300; run += 1) {
      const file = mutated(random, pick(random, FILES));
      const result = parseTemplate(file, { allowBuiltIn: true });
      if (result.template === null || result.problems.length > 0) continue;
      expect(JSON.parse(serializeTemplate(result.template)), `run ${run}`).toMatchObject(JSON.parse(JSON.stringify(file)));
    }
  });
});
