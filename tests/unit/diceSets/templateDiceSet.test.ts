import { describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';

const templates = vi.hoisted(() => new Map<string, { diceSetId?: string }>());
vi.mock('../../../src/app/statblocks/resolve/readStatblock', () => ({
  libraryTemplates: () => ({ get: (id: string) => (templates.has(id) ? { template: templates.get(id) } : null) }),
}));

import { templateDiceSet } from '../../../src/app/statblocks/resolve/templateDiceSet';

function appWith(frontmatter: Record<string, Record<string, unknown>>): App {
  return {
    vault: { getFileByPath: (path: string) => (path in frontmatter ? Object.assign(new TFile(), { path, extension: 'md' }) : null) },
    metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: frontmatter[file.path] }) },
  } as unknown as App;
}

describe('the dice set of a statblock\'s template', () => {
  templates.set('goblin-abc123', { diceSetId: 'builtin:power-roll' });
  templates.set('plain-abc123', {});
  const app = appWith({
    'Goblin.md': { statblock: true, 'atlas-template': 'goblin-abc123' },
    'Plain.md': { statblock: true, 'atlas-template': 'plain-abc123' },
    'Fantasy.md': { statblock: true },
    'Missing.md': { statblock: true, 'atlas-template': 'gone-abc123' },
  });

  it('is the set its template names', () => {
    expect(templateDiceSet(app, 'Goblin.md')?.id).toBe('builtin:power-roll');
  });

  it('is none for a template without one, a template the library lacks, a Fantasy Statblocks note and no note', () => {
    expect(templateDiceSet(app, 'Plain.md')).toBeUndefined();
    expect(templateDiceSet(app, 'Missing.md')).toBeUndefined();
    expect(templateDiceSet(app, 'Fantasy.md')).toBeUndefined();
    expect(templateDiceSet(app, 'Nowhere.md')).toBeUndefined();
    expect(templateDiceSet(app, undefined)).toBeUndefined();
  });
});
