import { describe, expect, it } from 'vitest';
import { allBuiltInTemplates } from '../../../../src/app/statblocks/library/builtInTemplates';
import type { TemplateLibrarySnapshot } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { builtInEntry } from '../../../../src/app/statblocks/library/templateFiles';
import { templateOptions, templateState } from '../../../../src/app/statblocks/settings/TemplatePicker';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { MARSH_ID, libraryEntry } from '../library/templateTexts';

function snapshot(loading = false): TemplateLibrarySnapshot {
  return {
    templates: [...allBuiltInTemplates().map(builtInEntry), libraryEntry(MARSH_CREATURE, 'Marsh creature')],
    files: new Map(),
    duplicates: new Map(),
    loading,
  };
}

describe('templateState', () => {
  it('knows built-ins at once and vault templates once the library has read the vault', () => {
    expect(templateState('builtin:cairn-creature', null)).toBe('found');
    expect(templateState('builtin:not-shipped', snapshot())).toBe('missing');
    expect(templateState(MARSH_ID, snapshot())).toBe('found');
    expect(templateState('gone-abc123', snapshot())).toBe('missing');
    expect(templateState('gone-abc123', snapshot(true))).toBe('reading');
    expect(templateState('gone-abc123', null)).toBe('reading');
  });
});

describe('templateOptions', () => {
  it('lists the vault\'s templates, then every built-in marked as such', () => {
    const options = templateOptions(MARSH_ID, snapshot(), []);
    expect(options[0]).toEqual({ value: MARSH_ID, label: 'Marsh creature' });
    expect(options.slice(1).map((option) => option.value)).toEqual(allBuiltInTemplates().map((builtIn) => builtIn.id));
    expect(options.slice(1).every((option) => option.detail === 'Built-in')).toBe(true);
  });

  it('puts the built-ins of the game system first, keeping the others in their order', () => {
    const options = templateOptions(MARSH_ID, snapshot(), ['builtin:cairn-creature', 'builtin:generic-hazard', 'builtin:cairn-creature']);
    const builtIns = options.slice(1).map((option) => option.value);
    expect(builtIns.slice(0, 2)).toEqual(['builtin:generic-hazard', 'builtin:cairn-creature']);
    expect(builtIns.slice(2)).toEqual(allBuiltInTemplates().map((builtIn) => builtIn.id).filter((id) => id !== 'builtin:generic-hazard' && id !== 'builtin:cairn-creature'));
  });

  it('keeps a role\'s template the vault lacks as the first choice, so the select can show it', () => {
    expect(templateOptions('gone-abc123', snapshot(), [])[0]).toEqual({ value: 'gone-abc123', label: 'Missing template' });
    expect(templateOptions('gone-abc123', snapshot(true), [])[0]).toEqual({ value: 'gone-abc123', label: 'Reading templates…' });
    expect(templateOptions('builtin:generic-npc', snapshot(), []).filter((option) => option.value === 'builtin:generic-npc')).toHaveLength(1);
  });
});
