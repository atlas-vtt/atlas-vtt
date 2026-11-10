import { describe, expect, it } from 'vitest';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import { trackScripts, withTrackBlocks, withTracksInPlace } from '../../../../src/app/statblocks/fs/fsTrackReplacement';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { BEAST_LAYOUT } from '../fs/fixtures/syntheticLayouts';
import { MARSH_LAYOUT } from './fsImportKit';

const imported = (): StatblockTemplate => fsLayoutToTemplate(MARSH_LAYOUT, { id: 'marsh-layout-abc123' }).template;
const types = (blocks: readonly TemplateBlock[]): string[] => blocks.map((block) => block.type);

describe('withTrackBlocks', () => {
  it('puts Track blocks where the script drew tracks, and adds the number fields they show', () => {
    const template = imported();
    const scriptAt = template.layout.blocks.findIndex((block) => block.type === 'script');
    expect(trackScripts(template)).toHaveLength(1);

    const replaced = withTrackBlocks(template);

    expect(types(replaced.layout.blocks).slice(scriptAt, scriptAt + 2)).toEqual(['track', 'track']);
    expect(flattenReadingOrder(replaced.layout.blocks).some((block) => block.type === 'script')).toBe(false);
    expect(replaced.layout.blocks.slice(scriptAt, scriptAt + 2)).toEqual([
      expect.objectContaining({ type: 'track', field: 'hp', look: 'boxes', counts: 'down' }),
      expect.objectContaining({ type: 'track', field: 'stress', look: 'boxes', counts: 'up' }),
    ]);
    expect(replaced.fields.filter((field) => ['hp', 'stress'].includes(field.key))).toEqual([
      { key: 'hp', label: 'Hit points', type: 'number' },
      { key: 'stress', label: 'Stress', type: 'number' },
    ]);
    expect(trackScripts(replaced)).toEqual([]);
  });

  it('keeps a field the template has, and every block id unique', () => {
    const template = imported();
    const withHp = { ...template, fields: [...template.fields, { key: 'hp', label: 'Hit points', type: 'text' as const }] };
    const replaced = withTrackBlocks(withHp);
    expect(replaced.fields.filter((field) => field.key === 'hp')).toEqual([{ key: 'hp', label: 'Hit points', type: 'text' }]);
    const ids = flattenReadingOrder(replaced.layout.blocks).map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns the template itself when no script draws tracks, or the named ones are others', () => {
    const template = imported();
    const replaced = withTrackBlocks(template);
    expect(withTrackBlocks(replaced)).toBe(replaced);
    expect(withTrackBlocks(template, ['not-a-block'])).toBe(template);
  });
});

describe('withTracksInPlace', () => {
  it('replaces the scripts Track blocks can stand in for and names only the scripts still kept', () => {
    const converted = fsLayoutToTemplate(BEAST_LAYOUT, { id: 'synthetic-beast-abc123' });
    const { template, report } = withTracksInPlace(converted);

    expect(types(flattenReadingOrder(template.layout.blocks)).filter((type) => type === 'track')).toEqual(['track', 'track']);
    expect(trackScripts(template)).toEqual([]);
    expect(report.scripts).toEqual(converted.report.scripts.filter((script) => script.suggestion !== 'track'));
    const kept = flattenReadingOrder(template.layout.blocks).flatMap((block) => (block.type === 'script' ? [block.id] : []));
    expect(report.scripts.map((script) => script.blockId).sort()).toEqual(kept.sort());
    expect(report.scripts.length).toBeGreaterThan(0);
  });

  it('leaves an import without tracks as it is', () => {
    const converted = fsLayoutToTemplate(MARSH_LAYOUT, { id: 'marsh-layout-abc123' });
    const once = withTracksInPlace(converted);
    expect(withTracksInPlace(once)).toEqual(once);
    expect(withTracksInPlace(once).template).toBe(once.template);
  });
});
