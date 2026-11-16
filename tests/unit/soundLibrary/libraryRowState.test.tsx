// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SoundHold } from '@/app/react/components/dm-screen/sound/soundHold';
import { LibraryRow, type RowHandlers } from '../../../src/app/react/components/dm-screen/sound/library/LibraryRow';
import type { LibraryRow as Row } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import type { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import type { SoundConversion } from '../../../src/app/soundLibrary/soundConversion';

const file = { kind: 'music' as const, path: 'Battle/Shieldwall.mp3', name: 'Shieldwall.mp3', size: 1, mtime: 1 };
const row: Row = { type: 'file', id: 'music:Battle/Shieldwall.mp3', name: 'Shieldwall', where: '', tagKeys: [], file };
const library = { onLengths: () => () => undefined, secondsOf: () => 150, locationOf: () => ({}) } as unknown as SoundLibrary;
const handlers = new Proxy({}, { get: () => vi.fn(() => true) }) as unknown as RowHandlers;

function stateOf(props: { sounding?: boolean; hold?: SoundHold; preparing?: boolean; conversion?: SoundConversion | null }): string {
  const { container } = render(
    <LibraryRow row={row} library={library} handlers={handlers} selected={false} active={false} renaming={false} held={undefined} previewing={false}
      sounding={props.sounding ?? false} hold={props.hold ?? null} preparing={props.preparing ?? false} conversion={props.conversion ?? null} style={{}} />,
  );
  return container.querySelector('.atlas-sound-lib__state')?.textContent ?? '';
}

afterEach(cleanup);

describe('a library row\'s state', () => {
  it('says Stopped or Paused while its track is held, as its mood tile does', () => {
    expect(stateOf({ sounding: true })).toBe('Playing');
    cleanup();
    expect(stateOf({ sounding: true, hold: 'stopped' })).toBe('Stopped');
    cleanup();
    expect(stateOf({ sounding: true, hold: 'paused' })).toBe('Paused');
  });

  it('says what to do with a file it cannot read, not only that it cannot', () => {
    // The cell holds the sentence, and its tooltip's label the same sentence for when the list is narrow.
    expect(stateOf({ conversion: { state: 'refused', reason: 'unknown-format' } })).toContain('Not an audio format Atlas reads. Convert it to MP3, Ogg, WAV or FLAC.');
  });

  it('says Preparing for a file of a folder just linked until its conversion begins', () => {
    expect(stateOf({ preparing: true, conversion: { state: 'not-converted' } })).toBe('Preparing');
    cleanup();
    expect(stateOf({ preparing: false, conversion: { state: 'not-converted' } })).toBe('');
    cleanup();
    expect(stateOf({ preparing: true, conversion: { state: 'converting', progress: 0.4 } })).toBe('Converting 40%');
  });
});
