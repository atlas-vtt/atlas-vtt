import { describe, expect, it } from 'vitest';
import { fileAccess } from '../../../src/app/soundDirector/directorDeps';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

describe('a record\'s file in the vault', () => {
  it('is where the record says, else its converted file or its source beside it', async () => {
    const { app } = createInMemoryApp({ folders: ['Library'] });
    await app.vault.adapter.write('Library/Tavern.opus', 'OPUS');
    await app.vault.adapter.write('Library/Storm.mp3', 'MP3');
    await app.vault.adapter.write('Library/Rain.mp3', 'MP3');
    await app.vault.adapter.write('Library/Rain.opus', 'OPUS');
    const files = fileAccess(app);
    expect(files.pathNow({ filePath: 'Library/Tavern.mp3' })).toBe('Library/Tavern.opus');
    expect(files.pathNow({ filePath: 'Library/Storm.opus' })).toBe('Library/Storm.mp3');
    expect(files.pathNow({ filePath: 'Library/Rain.mp3' }), 'where the record says comes first').toBe('Library/Rain.mp3');
    expect(files.statOf({ filePath: 'Library/Tavern.mp3' })).toMatchObject({ size: 4 });
    expect(new TextDecoder().decode(await files.read({ filePath: 'Library/Tavern.mp3' }) as ArrayBuffer)).toBe('OPUS');
  });
});
