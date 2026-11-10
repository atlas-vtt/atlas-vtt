import { describe, expect, it } from 'vitest';
import { hiddenFields } from '../../../../src/app/statblocks/editor/statblock-pane/templateChoices';
import { setHeaderPartHidden } from '../../../../src/app/statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Tier', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
];
const LINE: TemplateBlock = { id: 'line0001', type: 'line', fields: ['type'] };

function hiding(blocks: TemplateBlock[]): StatblockTemplate {
  return setHeaderPartHidden(setHeaderPartHidden(template(blocks, FIELDS), 'level', true), 'type', true);
}

describe('the values a template hides from the card', () => {
  it('are the properties of its hidden header parts, by the name the template gives them', () => {
    expect(hiddenFields(hiding([])).map((field) => field.label)).toEqual(['Tier', 'Type']);
  });

  it('leave out a property the card shows another way, and are none where nothing is hidden', () => {
    expect(hiddenFields(hiding([LINE])).map((field) => field.key)).toEqual(['level']);
    expect(hiddenFields(template([LINE], FIELDS))).toEqual([]);
  });

  it('hold the name where the header shows a display name in its place, so the card never hides what identifies the statblock', () => {
    const titled = template([], [...FIELDS, { key: 'title', label: 'Title', type: 'text', meaning: 'display-name' }]);
    expect(hiddenFields(titled).map((field) => field.key)).toEqual(['name']);
  });
});
