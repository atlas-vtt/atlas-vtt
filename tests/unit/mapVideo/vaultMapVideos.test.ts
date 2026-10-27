// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import type { Renderer } from 'pixi.js';
import { vaultMapVideos } from '../../../src/app/pixi/mapImage/video/vaultMapVideos';
import type { MapImageService } from '../../../src/app/pixi/mapImage/MapImageService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

describe('an animated map that cannot be played', () => {
  it('is reported while its file is there, and not once the file was deleted', () => {
    const { app, files } = createInMemoryApp({ files: { 'maps/river.webm': 'WEBM' } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath as never;
    const service = { reportVideoStill: vi.fn() } as unknown as MapImageService;
    const videos = vaultMapVideos(app, service, {} as Renderer, document.createElement('canvas'));
    const file = new TFile('maps/river.webm');

    videos.reportStill(file, { kind: 'unplayable', error: new Error('decode') });
    files.delete('maps/river.webm');
    videos.reportStill(file, { kind: 'unplayable', error: new Error('read') });

    expect(service.reportVideoStill).toHaveBeenCalledTimes(1);
  });
});
