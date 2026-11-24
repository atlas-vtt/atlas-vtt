// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MusicSharePicker } from '../../../src/app/armarium/share/MusicSharePicker';

const file = (path: string): { kind: 'music'; path: string; name: string; size: number; mtime: number } => ({ kind: 'music', path, name: path.split('/').pop() ?? path, size: 1, mtime: 1 });
const tracks = [
  { name: 'Naglfar', where: 'Vibes', file: file('Vibes/Naglfar.mp3') },
  { name: 'Fimbulvetr', where: 'Vibes', file: file('Vibes/Fimbulvetr.mp3') },
  { name: 'Loose One', where: '', file: file('Loose One.mp3') },
];

vi.mock('../../../src/app/soundLibrary/SoundLibrary', () => ({ SoundLibrary: { forApp: () => ({}) } }));
vi.mock('../../../src/app/soundLibrary/SoundRecordStore', () => ({ SoundRecordStore: { forApp: () => ({}) } }));
vi.mock('../../../src/app/armarium/share/musicChoices', async (original) => ({
  ...(await original<typeof import('../../../src/app/armarium/share/musicChoices')>()),
  musicChoices: () => Promise.resolve({ albums: [{ key: 'Vibes', name: 'Vibes', files: [tracks[0].file, tracks[1].file] }], tracks }),
}));

afterEach(cleanup);

describe('the album picker before anything is typed', () => {
  it('lists the tracks under the tags, and shares the ticked ones as an album without a tag', async () => {
    const onPick = vi.fn();
    render(<MusicSharePicker app={{} as App} kind="music-album" onPick={onPick} onClose={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Vibes.*2/ })).toBeTruthy();
    const loose = screen.getByRole('button', { name: 'Loose One' });
    const tagged = screen.getByRole('button', { name: /Naglfar/ });
    fireEvent.click(loose);
    fireEvent.click(tagged);
    expect(loose.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Share 2 tracks' }));
    expect(onPick).toHaveBeenCalledWith([tracks[0].file, tracks[2].file], '');
  });
});
