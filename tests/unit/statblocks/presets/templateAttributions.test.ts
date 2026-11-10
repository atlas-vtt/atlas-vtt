import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BuiltInTemplate, TemplateLicence } from '../../../../src/app/statblocks/model/templateTypes';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import { DRAW_STEEL_NOTICE, LICENSED_BUILT_INS } from '../../../../src/app/statblocks/presets/attributions';

const ROOT = join(__dirname, '../../../..');
const PRESETS = join(ROOT, 'src/app/statblocks/presets');
const NOTICES = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/** Each preset file and the licences its SPDX header names. */
const SPDX: Readonly<Record<string, string>> = {
  'attributions.ts': 'AGPL-3.0-only',
  'bxCreature.ts': 'AGPL-3.0-only',
  'cairn.ts': 'CC-BY-SA-4.0 OR GPL-3.0-only',
  'd20Creature.ts': 'AGPL-3.0-only',
  'drawSteel.ts': 'AGPL-3.0-only AND LicenseRef-DRAW-STEEL-Creator-License',
  'fate.ts': 'AGPL-3.0-only AND CC-BY-3.0',
  'fiveE2014.ts': 'AGPL-3.0-only AND CC-BY-4.0',
  'fiveE2024.ts': 'AGPL-3.0-only AND CC-BY-4.0',
  'fiveEChallenge.ts': 'AGPL-3.0-only AND CC-BY-4.0',
  'generic.ts': 'AGPL-3.0-only',
  'index.ts': 'AGPL-3.0-only',
  'narrativeNpc.ts': 'AGPL-3.0-only',
  'percentileCreature.ts': 'AGPL-3.0-only',
  'presetParts.ts': 'AGPL-3.0-only',
};

/** Publisher marks no shipped template has a licence route for (§10.2–10.4 of the plan). */
const UNLICENSED_MARKS = [
  /D\s*&\s*D/i, /Dungeons\s*(&|and)\s*Dragons/i, /Pathfinder/i, /Daggerheart/i, /Shadowdark/i, /Cthulhu/i,
  /Old[-\s]School Essentials/i, /\bOSE\b/, /Cyberpunk/i, /Wizards of the Coast/i, /Paizo/i, /Chaosium/i,
  /Darrington/i, /Necrotic Gnome/i, /Talsorian/i, /Bunkers/i,
];

/** Marks a template may carry only together with the source that licenses it. */
const LICENSED_MARKS: readonly (readonly [RegExp, TemplateLicence])[] = [
  [/\b5E\b/i, 'CC-BY-4.0'], [/\bSRD\b/i, 'CC-BY-4.0'], [/Cairn/i, 'CC-BY-SA-4.0'], [/Draw Steel/i, 'DS-Creator'],
  [/MCDM/i, 'DS-Creator'], [/\bFate\b/i, 'CC-BY-3.0'], [/Evil Hat/i, 'CC-BY-3.0'],
];

/** Everything a template shows or stores except its source: name, labels, headings, patterns, samples. */
function shownText(builtIn: BuiltInTemplate): string {
  const { source: _source, ...rest } = builtIn.template;
  return `${builtIn.name}\n${JSON.stringify(rest)}`;
}

describe('built-in attribution', () => {
  it('lists only built-ins that exist', () => {
    const ids = new Set(BUILT_IN_TEMPLATES.map((builtIn) => builtIn.id));
    for (const id of LICENSED_BUILT_INS) expect(ids.has(id), id).toBe(true);
  });

  it.each(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn] as const))('%s has a source exactly when it is licensed', (id, builtIn) => {
    const { source } = builtIn.template;
    if (!LICENSED_BUILT_INS.includes(builtIn.id)) {
      expect(source).toBeUndefined();
      return;
    }
    if (!source) throw new Error(`${id} has no source`);
    for (const text of [source.system, source.label, source.attribution, source.licenceUrl, source.modification]) {
      expect(text.trim(), id).not.toBe('');
    }
    expect(source.licences.length).toBeGreaterThan(0);
    expect(source.licenceUrl).toMatch(/^https:\/\//);
  });

  it('quotes every attribution verbatim in THIRD_PARTY_NOTICES.md and README.md', () => {
    const sources = BUILT_IN_TEMPLATES.flatMap((builtIn) => (builtIn.template.source ? [builtIn.template.source] : []));
    expect(sources).toHaveLength(LICENSED_BUILT_INS.length);
    for (const source of sources) {
      expect(NOTICES.includes(source.attribution), `${source.system} in THIRD_PARTY_NOTICES.md`).toBe(true);
      expect(README.includes(source.attribution), `${source.system} in README.md`).toBe(true);
      if (source.trademarkNotice) expect(NOTICES.includes(source.trademarkNotice), source.system).toBe(true);
    }
  });

  it('states the Draw Steel notice whole, naming only its own parts as the product', () => {
    expect(DRAW_STEEL_NOTICE).toBe('The Draw Steel statblock template and system preset in Atlas VTT are an independent product published under the DRAW STEEL Creator License and are not affiliated with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.');
    expect(README).toContain(DRAW_STEEL_NOTICE);
    expect(NOTICES).toContain(DRAW_STEEL_NOTICE);
  });

  it.each(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn] as const))('%s names no publisher without a licence route', (id, builtIn) => {
    const text = shownText(builtIn);
    for (const mark of UNLICENSED_MARKS) expect(mark.test(text), `${id}: ${mark.source}`).toBe(false);
    for (const [mark, licence] of LICENSED_MARKS) {
      if (mark.test(text)) expect(builtIn.template.source?.licences, `${id}: ${mark.source}`).toContain(licence);
    }
  });

  it('would notice a publisher in a label', () => {
    const [first] = BUILT_IN_TEMPLATES;
    if (!first) throw new Error('no built-ins');
    const renamed: BuiltInTemplate = { ...first, name: 'Pathfinder creature' };
    expect(UNLICENSED_MARKS.some((mark) => mark.test(shownText(renamed)))).toBe(true);
  });

  it('gives every preset file an SPDX header naming its licences', () => {
    const files = readdirSync(PRESETS).filter((file) => file.endsWith('.ts')).sort();
    expect(files).toEqual(Object.keys(SPDX).sort());
    for (const file of files) {
      const [first] = readFileSync(join(PRESETS, file), 'utf8').split('\n');
      expect(first, file).toBe(`// SPDX-License-Identifier: ${SPDX[file] ?? ''}`);
    }
  });
});
