// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { withoutHeaderDuplicates } from '../../../../src/app/statblocks/model/headerDuplicates';
import { headerParts, setHeaderPartHidden } from '../../../../src/app/statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { renderSheet } from '../render/sheetTestKit';
import { shape, template } from '../template-editor/editorKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'feats', label: 'Features', type: 'entries' },
];
const FEATS: TemplateBlock = { id: 'entfeat0', type: 'entries', field: 'feats' };
const HP_TRACK: TemplateBlock = { id: 'trkhp000', type: 'track', field: 'hp', resource: 'hp', look: 'boxes', counts: 'down' };
const STRESS_TRACK: TemplateBlock = { id: 'trkstr00', type: 'track', field: 'stress', resource: 'stress', look: 'boxes', counts: 'up' };

const imported = (): StatblockTemplate => template([FEATS, HP_TRACK, STRESS_TRACK], FIELDS);

describe('hit points a template draws as a track', () => {
  it('move into the header, which draws them as that track', () => {
    const read = withoutHeaderDuplicates(imported());
    expect(shape(read.layout.blocks)).toBe('entfeat0 trkstr00');
    expect(read.header?.hitPoints).toEqual({ look: 'boxes', counts: 'down', resource: 'hp' });
    const hp = headerParts(read).find((part) => part.id === 'hp')!;
    expect(hp.block).toMatchObject({ type: 'track', field: 'hp', look: 'boxes', counts: 'down', resource: 'hp' });
    expect(withoutHeaderDuplicates(read)).toBe(read);
  });

  it('keep that look through the file and when a part of the header is hidden', () => {
    const read = withoutHeaderDuplicates(imported());
    const again = parseTemplate(serializeTemplate(read));
    expect(again.problems).toEqual([]);
    expect(again.template?.header).toEqual({ hitPoints: { look: 'boxes', counts: 'down', resource: 'hp' } });
    const hiding = setHeaderPartHidden(read, 'description', true);
    expect(hiding.header).toEqual({ hitPoints: { look: 'boxes', counts: 'down', resource: 'hp' }, hidden: ['description'] });
    expect(setHeaderPartHidden(hiding, 'description', false).header).toEqual(read.header);
  });

  it('show as boxes in the header of the card', () => {
    const { container } = renderSheet(withoutHeaderDuplicates(imported()), { name: 'Bandit', hp: 5, stress: 2 });
    const hp = container.querySelector('.atlas-sb-header [data-block-id="header-hp"]');
    expect(hp?.getAttribute('data-block')).toBe('track');
    expect(container.querySelector('.atlas-sb-sheet > :not(.atlas-sb-header) [data-block-id="trkhp000"]')).toBeNull();
  });

  it('show again where an earlier read had hidden the header\'s hit points', () => {
    const hid = setHeaderPartHidden(imported(), 'hp', true);
    const read = withoutHeaderDuplicates(setHeaderPartHidden(hid, 'type', true));
    expect(read.header).toEqual({ hidden: ['type'], hitPoints: { look: 'boxes', counts: 'down', resource: 'hp' } });
    expect(headerParts(read).find((part) => part.id === 'hp')?.hidden).toBe(false);
  });

  it('stay a number where no track draws them', () => {
    const plain = withoutHeaderDuplicates(template([FEATS], FIELDS));
    expect(plain.header).toBeUndefined();
    expect(headerParts(plain).find((part) => part.id === 'hp')?.block.type).toBe('stat');
  });
});
