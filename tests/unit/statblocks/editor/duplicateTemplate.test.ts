import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import * as templateActions from '../../../../src/app/statblocks/library/templateActions';
import { duplicateTemplate } from '../../../../src/app/statblocks/editor/statblock-pane/duplicateTemplate';
import type { PaneServices } from '../../../../src/app/statblocks/editor/paneServices';

const APP = {} as App;
const RECORD = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Colossus' };

function writer(outcome: { problem: string | null; conflicts: unknown[] }): PaneServices['writer'] & { write: ReturnType<typeof vi.fn> } {
  return { write: vi.fn().mockResolvedValue({ applied: [], ...outcome }) } as unknown as PaneServices['writer'] & { write: ReturnType<typeof vi.fn> };
}

afterEach(() => vi.restoreAllMocks());

describe('Duplicate template', () => {
  it('copies the template of the note and switches the note to the copy, in one write of its template key', async () => {
    vi.spyOn(templateActions, 'copyTemplate').mockResolvedValue({ id: 'creature-copy-a1b2c3', path: 'Templates/Creature copy.atlastemplate' });
    const notes = writer({ problem: null, conflicts: [] });
    const copy = await duplicateTemplate(APP, notes, 'Colossus.md', RECORD, 'builtin:generic-creature');
    expect(copy).toEqual({ id: 'creature-copy-a1b2c3', path: 'Templates/Creature copy.atlastemplate' });
    expect(templateActions.copyTemplate).toHaveBeenCalledWith(APP, 'builtin:generic-creature');
    expect(notes.write).toHaveBeenCalledTimes(1);
    expect(notes.write.mock.calls[0]?.[0]).toBe('Colossus.md');
  });

  it('gives nothing to open where the note could not switch or the copy failed', async () => {
    vi.spyOn(templateActions, 'copyTemplate').mockResolvedValue({ id: 'creature-copy-a1b2c3', path: 'x.atlastemplate' });
    expect(await duplicateTemplate(APP, writer({ problem: 'locked', conflicts: [] }), 'Colossus.md', RECORD, 'builtin:generic-creature')).toBeNull();
    vi.spyOn(templateActions, 'copyTemplate').mockRejectedValue(new Error('no'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await duplicateTemplate(APP, writer({ problem: null, conflicts: [] }), 'Colossus.md', RECORD, 'builtin:generic-creature')).toBeNull();
  });
});
