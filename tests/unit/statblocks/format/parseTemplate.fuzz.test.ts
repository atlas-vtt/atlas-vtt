import { describe, expect, it } from 'vitest';
import { parseTemplate, type TemplateParseResult } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import { EVERY_BLOCK_JSON, FIVE_E_2024_JSON, MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { expectSound, fileOf, int, mulberry32, mutated, pick, type Random } from './templateMutations';

const TEXTS = [
  MARSH_CREATURE_JSON, FIVE_E_2024_JSON, EVERY_BLOCK_JSON,
  ...BUILT_IN_TEMPLATES.map((builtIn) => serializeTemplate(builtIn.template)),
];
const FILES = TEXTS.map(fileOf);
const STATUSES = ['ok', 'invalid', 'newer', 'reserved'];
const RUNS = 2000;

function check(result: TemplateParseResult, run: number): void {
  expect(STATUSES, `run ${run}`).toContain(result.status);
  expect(Array.isArray(result.problems)).toBe(true);
  if (result.status === 'invalid' || result.status === 'reserved') {
    expect(result.template, `run ${run}`).toBeNull();
    return;
  }
  if (result.template === null) throw new Error(`run ${run}: ${result.status} without a template`);
  expectSound(result.template);
  expect(() => serializeTemplate(result.template as NonNullable<typeof result.template>)).not.toThrow();
}

/** Text-level damage: what a sync conflict or a hand edit leaves. */
function damaged(random: Random, text: string): string {
  const at = int(random, text.length);
  switch (int(random, 4)) {
    case 0: return text.slice(0, at);
    case 1: return text.slice(0, at) + pick(random, ['{', '}', '[', ']', ',', '"', ':', '\\', '\u0000', '﻿']) + text.slice(at);
    case 2: return text.slice(0, at) + text.slice(at + 1 + int(random, 20));
    default: return text.replace('"blocks": [', `"blocks": [${'['.repeat(100_000)}${']'.repeat(100_000)}, `);
  }
}

describe('parseTemplate fuzzing', () => {
  it(`never throws on ${RUNS} mutated templates and always gives one of the four statuses`, () => {
    const random = mulberry32(0xa71a5);
    for (let run = 0; run < RUNS; run += 1) {
      const file = mutated(random, pick(random, FILES));
      const allowBuiltIn = random() < 0.5;
      check(parseTemplate(file, { allowBuiltIn }), run);
      check(parseTemplate(JSON.stringify(file), { allowBuiltIn }), run);
    }
    // About 1.5 s alone; the full suite runs files side by side and once took it past the 5 s default.
  }, 60_000);

  it('never throws on damaged text', () => {
    const random = mulberry32(0xd00d);
    for (let run = 0; run < 400; run += 1) {
      check(parseTemplate(damaged(random, pick(random, TEXTS)), { allowBuiltIn: true }), run);
    }
  }, 60_000);

  it('reads JSON nested 100,000 deep without overflowing the stack', () => {
    const deep = `${'['.repeat(100_000)}${']'.repeat(100_000)}`;
    const text = MARSH_CREATURE_JSON.replace('"suits":', `"deep": ${deep}, "suits":`);
    const result = parseTemplate(text);
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([expect.stringContaining('"deep" cannot be written as JSON')]);
    expect(() => serializeTemplate(result.template as NonNullable<typeof result.template>)).not.toThrow();
  });

  it('reads objects that are no JSON: cycles, functions, symbols and non-finite numbers', () => {
    const file: Record<string, unknown> = { ...fileOf(MARSH_CREATURE_JSON) as Record<string, unknown> };
    file.self = file;
    file.run = (): number => 1;
    file.mark = Symbol('mark');
    file.big = 10n;
    file.ratio = Number.NaN;
    file.sample = { hp: Number.POSITIVE_INFINITY, name: 'X', skip: undefined };
    const result = parseTemplate(file);
    expect(result.status).toBe('ok');
    const written = JSON.parse(serializeTemplate(result.template as NonNullable<typeof result.template>));
    expect(written).not.toHaveProperty('self');
    expect(written).not.toHaveProperty('run');
    expect(written.ratio).toBeNull();
    expect(written.sample).toEqual({ hp: null, name: 'X' });
  });

  it('keeps keys named like Object.prototype members as plain data', () => {
    const text = MARSH_CREATURE_JSON.replace('"suits":', '"__proto__": { "polluted": true }, "constructor": 1, "suits":');
    const result = parseTemplate(text);
    const template = result.template as NonNullable<typeof result.template>;
    expect(Object.getPrototypeOf(template)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(template, '__proto__')).toBe(true);
    const written = serializeTemplate(template);
    expect(written).toContain('"__proto__": {');
    expect(serializeTemplate(parseTemplate(written).template as NonNullable<typeof result.template>)).toBe(written);
  });
});
