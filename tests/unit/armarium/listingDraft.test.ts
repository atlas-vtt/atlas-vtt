import { describe, expect, it } from 'vitest';
import { draftFrom, fieldsOfDraft, listingProblems, rightsProblems, systemOfPreset, toggledTags } from '../../../src/app/armarium/upload/listingDraft';
import { withPublishedFloor } from '../../../src/app/armarium/upload/shareState';
import type { ExportPreview } from '../../../src/app/services/collectionBundle/collectionExport';

describe('the listing form', () => {
  it('starts from the collection\'s game system where the Armarium names it', () => {
    expect(systemOfPreset('builtin:cairn')).toBe('cairn');
    expect(systemOfPreset('builtin:dnd5e')).toBe('dnd5e');
    expect(systemOfPreset('builtin:any')).toBeNull();
    expect(systemOfPreset('my-homebrew-preset')).toBeNull();
    expect(systemOfPreset(undefined)).toBeNull();
    expect(draftFrom(null, 'cairn')).toEqual({ kind: null, system: 'cairn', description: '', tags: [], licence: null, credits: '' });
    expect(draftFrom({ kind: 'maps', system: null, description: 'd', tags: ['forest'], licence: 'cc0', credits: '' }, 'cairn').system).toBe('none');
  });

  it('asks for a kind and a description of 20 to 5000 characters before the rights', () => {
    const draft = draftFrom(null, null);
    expect(listingProblems(draft)).toEqual({ kind: 'missing', description: 'missing' });
    expect(listingProblems({ ...draft, kind: 'maps', description: '   short   ' })).toEqual({ description: 'too-short' });
    expect(listingProblems({ ...draft, kind: 'maps', description: 'x'.repeat(5001) })).toEqual({ description: 'too-long' });
    // Counted as code points without the white space around them, as the Armarium counts.
    expect(listingProblems({ ...draft, kind: 'maps', description: `  ${'é'.repeat(20)}  ` })).toEqual({});
  });

  it('asks for a licence and credits within their limit before publishing', () => {
    const draft = { ...draftFrom(null, null), kind: 'maps' as const, description: 'Twenty characters at least.' };
    expect(rightsProblems(draft)).toEqual({ licence: 'missing' });
    expect(rightsProblems({ ...draft, licence: 'cc0', credits: 'x'.repeat(2001) })).toEqual({ credits: 'too-long' });
    expect(fieldsOfDraft(draft)).toBeNull();
    expect(fieldsOfDraft({ ...draft, licence: 'cc0', tags: ['one-shot', 'forest'] })).toEqual({ kind: 'maps', system: null, description: 'Twenty characters at least.', tags: ['forest', 'one-shot'], licence: 'cc0', credits: '' });
  });

  it('ticks tags in the list\'s order, one AI tag at most and eight in all', () => {
    expect(toggledTags([], 'one-shot')).toEqual(['one-shot']);
    expect(toggledTags(['one-shot'], 'fantasy')).toEqual(['fantasy', 'one-shot']);
    expect(toggledTags(['fantasy', 'one-shot'], 'fantasy')).toEqual(['one-shot']);
    expect(toggledTags(['no-ai'], 'ai-assisted')).toEqual(['ai-assisted']);
    const eight = ['fantasy', 'horror', 'dungeon', 'forest', 'ruins', 'one-shot', 'monsters', 'no-ai'] as const;
    expect(toggledTags(eight, 'swamp')).toEqual([...eight]);
    // Replacing the AI tag does not add one.
    expect(toggledTags(eight, 'ai-generated')).toContain('ai-generated');
  });

  it('suggests a version above what the Armarium published, except for a collection of one\'s own made from another', () => {
    const preview = { publisher: 'self', minimumVersion: 2, suggestedVersion: 3 } as ExportPreview;
    expect(withPublishedFloor(preview, null)).toBe(preview);
    expect(withPublishedFloor(preview, { uid: 'u', slug: 's', fields: null, newestVersion: 5 })).toMatchObject({ minimumVersion: 6, suggestedVersion: 6 });
    expect(withPublishedFloor(preview, { uid: 'u', slug: 's', fields: null, newestVersion: 1 })).toMatchObject({ minimumVersion: 2, suggestedVersion: 3 });
    const fork = { ...preview, publisher: 'other' } as ExportPreview;
    expect(withPublishedFloor(fork, { uid: 'u', slug: 's', fields: null, newestVersion: 5 })).toBe(fork);
  });
});
