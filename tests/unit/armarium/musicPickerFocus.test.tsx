// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MusicSharePicker } from '../../../src/app/armarium/share/MusicSharePicker';

vi.mock('../../../src/app/soundLibrary/SoundLibrary', () => ({ SoundLibrary: { forApp: () => ({}) } }));
vi.mock('../../../src/app/soundLibrary/SoundRecordStore', () => ({ SoundRecordStore: { forApp: () => ({}) } }));
vi.mock('../../../src/app/armarium/share/musicChoices', () => ({
  musicChoices: () => Promise.resolve({ albums: [], tracks: [{ name: 'Naglfar', where: 'Ragnarök', file: { kind: 'music', path: 'Ragnarök/Naglfar.mp3', name: 'Naglfar.mp3', size: 1, mtime: 1 } }] }),
  tracksMatching: (tracks: unknown[]) => tracks,
}));

afterEach(cleanup);

describe('the music picker opened from the Armarium page', () => {
  it('takes the keyboard from the page\'s frame, also when the frame takes it back after the press', async () => {
    const frame = document.body.createEl('iframe');
    frame.focus();
    expect(document.activeElement).toBe(frame);
    render(<MusicSharePicker app={{} as App} kind="music-album" onPick={vi.fn()} onClose={vi.fn()} />);
    const search = await screen.findByRole('searchbox');
    expect(document.activeElement).toBe(search);

    frame.focus();
    await act(async () => {
      window.dispatchEvent(new FocusEvent('blur'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(search);
    frame.remove();
  });
});
