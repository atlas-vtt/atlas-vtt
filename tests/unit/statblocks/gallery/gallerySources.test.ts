import { describe, expect, it } from 'vitest';
import { allBuiltInTemplates, builtInTemplate } from '../../../../src/app/statblocks/library/builtInTemplates';
import { builtInEntry } from '../../../../src/app/statblocks/library/templateFiles';
import {
  blankTemplate, firstBlockId, firstSource, gallerySources, roleFor, rolesWithoutOwnTemplate, sourceLine, sourceTemplates, systemTemplateIds,
} from '../../../../src/app/statblocks/editor/gallery/gallerySources';
import { LICENSED_BUILT_INS } from '../../../../src/app/statblocks/presets/attributions';
import type { StatblockRole } from '../../../../src/app/statblocks/model/roleTypes';
import type { LibraryTemplate } from '../../../../src/app/statblocks/model/resolvedTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { libraryEntry, MARSH_ID } from '../library/templateTexts';

const builtIns = allBuiltInTemplates().map(builtInEntry);
const marsh = libraryEntry(MARSH_CREATURE, 'Marsh creature');
const lookup = (id: string): LibraryTemplate | null => {
  const builtIn = builtInTemplate(id);
  if (builtIn) return builtInEntry(builtIn);
  return id === MARSH_ID ? marsh : null;
};
const role = (id: string, templateId: string): StatblockRole => ({ id, name: id[0]!.toUpperCase() + id.slice(1), templateId });

describe('the gallery\'s sources', () => {
  it('lists This system first where the system names templates, and leaves it out otherwise', () => {
    expect(gallerySources(['builtin:5e-2024-monster']).map((source) => source.label))
      .toEqual(['This system', 'All built-ins', 'Simple', 'From a statblock', 'Blank']);
    expect(gallerySources([]).map((source) => source.id)).toEqual(['built-ins', 'simple', 'statblock', 'blank']);
    expect(firstSource(gallerySources([]))).toBe('built-ins');
    expect(firstSource(gallerySources(['builtin:cairn-creature']))).toBe('system');
  });

  it('takes the system\'s templates from its roles, each once', () => {
    const roles = [role('monster', 'builtin:5e-2024-monster'), role('npc', 'builtin:5e-2024-monster'), role('hag', MARSH_ID)];
    expect(systemTemplateIds(roles)).toEqual(['builtin:5e-2024-monster', MARSH_ID]);
    expect(systemTemplateIds(undefined)).toEqual([]);
  });

  it('shows the system\'s templates, every built-in, and the generic tier', () => {
    const names = (source: Parameters<typeof sourceTemplates>[0], ids: string[] = []): string[] =>
      sourceTemplates(source, builtIns, ids, lookup).map((entry) => entry.template.id);
    expect(names('system', ['builtin:5e-2024-monster', MARSH_ID, 'gone-abc123', MARSH_ID])).toEqual(['builtin:5e-2024-monster', MARSH_ID]);
    expect(names('built-ins')).toEqual(builtIns.map((entry) => entry.template.id));
    expect(names('simple')).toEqual(['builtin:generic-creature', 'builtin:generic-npc', 'builtin:generic-hazard']);
    expect(names('statblock')).toEqual([]);
    expect(names('blank')).toEqual([]);
  });

  it('gives a source line to the licensed built-ins alone', () => {
    const withLine = builtIns.filter((entry) => sourceLine(entry.template) !== null).map((entry) => entry.template.id);
    expect(withLine.sort()).toEqual([...LICENSED_BUILT_INS].sort());
    expect(sourceLine(builtInTemplate('builtin:5e-2024-monster')!.template)).toBe('SRD 5.2.1 · CC BY 4.0');
    expect(sourceLine(builtInTemplate('builtin:generic-creature')!.template)).toBeNull();
  });
});

describe('Use for', () => {
  const inVault = (id: string): boolean => id === MARSH_ID;

  it('offers the roles that start from a built-in or a template the vault no longer has', () => {
    const roles = [role('monster', 'builtin:5e-2024-monster'), role('hag', MARSH_ID), role('npc', 'gone-abc123')];
    expect(rolesWithoutOwnTemplate(roles, inVault).map((candidate) => candidate.id)).toEqual(['monster', 'npc']);
  });

  it('starts on the role that uses the chosen template, and on none otherwise', () => {
    const roles = [role('monster', 'builtin:5e-2024-monster'), role('npc', 'builtin:generic-npc')];
    expect(roleFor(roles, 'builtin:generic-npc')).toBe('npc');
    expect(roleFor(roles, 'builtin:cairn-creature')).toBeNull();
    expect(roleFor(roles, null)).toBeNull();
  });
});

describe('the blank template', () => {
  it('has no blocks and no fields, so the editor shows its ghost card', () => {
    const blank = blankTemplate();
    expect(blank.fields).toEqual([]);
    expect(blank.layout.blocks).toEqual([]);
    expect(firstBlockId(blank)).toBeNull();
    expect(firstBlockId(MARSH_CREATURE)).toBe(MARSH_CREATURE.layout.blocks[0]!.id);
  });
});

describe('built-ins a collection names', () => {
  it('lists the templates of the game a collection is named for (spec E2)', async () => {
    const { builtInsNamedBy } = await import('../../../../src/app/statblocks/editor/gallery/gallerySources');
    const { builtInEntry } = await import('../../../../src/app/statblocks/library/templateFiles');
    const { BUILT_IN_TEMPLATES } = await import('../../../../src/app/statblocks/presets');
    const builtIns = BUILT_IN_TEMPLATES.map(builtInEntry);
    expect(builtInsNamedBy('5e', builtIns).sort()).toEqual(['builtin:5e-2014-monster', 'builtin:5e-2024-monster']);
    expect(builtInsNamedBy('Cairn campaign', builtIns)).toEqual(['builtin:cairn-creature']);
    expect(builtInsNamedBy('Daggerheart', builtIns)).toEqual([]);
  });
});
