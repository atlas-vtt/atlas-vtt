import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT } from '../../../../src/app/statblocks/model/templateTypes';

const file = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: TEMPLATE_FORMAT, version: 1, id: 'tiny-abc123', description: 'A tiny one', ...extra, fields: [], layout: { maxColumns: 2, blocks: [] },
});

// A template's body lives in the note beside its file; a "body" written into the file itself is a key Atlas does not know.
describe('a template file that still holds a body', () => {
  it('reads without a problem and keeps the key for the file, as any key it does not know', () => {
    const result = parseTemplate(file({ body: '## Tactics\n' }));
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    expect(JSON.parse(serializeTemplate(result.template!))).toMatchObject({ body: '## Tactics\n' });
  });
});
