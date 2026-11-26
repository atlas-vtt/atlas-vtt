import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from 'obsidian';
import { fileInputAccept, fileInputAttrs } from '../../../src/app/platform/fileInputAccept';

const MAPS = 'image/*,.dd2vtt,.uvtt,.df2vtt,.webm,.mp4,.m4v';

afterEach(() => {
  Platform.isMobile = false;
  Platform.isDesktopApp = true;
});

describe('what a file picker is told to offer', () => {
  it.each(['image/*', MAPS, '.zip', '.json,application/json', '.pdf,.xlsx,.csv,.tsv,.md,.markdown,.txt'])('is the list itself in the desktop app (%s)', (accept) => {
    expect(fileInputAccept(accept)).toBe(accept);
    expect(fileInputAttrs(accept)).toEqual({ accept });
  });

  it('stays a list of MIME types alone on a tablet', () => {
    expect(fileInputAccept('image/*', false)).toBe('image/*');
    expect(fileInputAccept('image/*, video/mp4', false)).toBe('image/*,video/mp4');
  });

  it.each([MAPS, '.dd2vtt', '.zip', '.json,application/json', '.ogg,.mp3'])('is every file on a tablet once the list names an extension (%s)', (accept) => {
    expect(fileInputAccept(accept, false)).toBeUndefined();
    expect(fileInputAttrs(accept, false)).toEqual({});
  });

  it('follows Obsidian where it is not told the device', () => {
    Platform.isMobile = true;
    expect(fileInputAccept(MAPS)).toBeUndefined();
    Platform.isMobile = false;
    Platform.isDesktopApp = false;
    expect(fileInputAccept(MAPS)).toBeUndefined();
  });
});
