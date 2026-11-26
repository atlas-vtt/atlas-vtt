import { afterAll, describe, expect, it } from 'vitest';
import type { PluginManifest } from 'obsidian';
import { disposeImageProcessing } from '../../src/app/imageProcessing/imageProcessing';
import { browserProbes } from '../../src/app/support/tablet/browserProbes';
import { collectTabletReport } from '../../src/app/support/tablet/collectTabletReport';
import { viewportSize } from '../../src/app/support/tablet/deviceProbes';
import { takeMemory } from '../../src/app/support/tablet/memoryProbe';
import { REPORT_SECTIONS, formatReport } from '../../src/app/support/tablet/reportModel';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * The Tablet diagnostics' probes on a real engine: only a browser has canvases, WebGL 2 and workers
 * to ask. Runs in the `gpu` project on Chromium; it reads the engine's own encoder, so it holds on
 * WebKit too once that project lists it.
 */

const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrom(e|ium)/.test(navigator.userAgent);
const manifest = { id: 'atlas-vtt', version: '0.17.1' } as PluginManifest;

afterAll(() => disposeImageProcessing());

describe('the tablet report on a real engine', () => {
  it('asks the canvases, WebGL 2 and the image workers, and every section answers', async () => {
    const { app } = createInMemoryApp({ files: { 'Hidden Vale/Dragon Hoard.md': '# Hoard' } });
    const sections = await collectTabletReport({
      app, manifest, win: window, probes: browserProbes(),
      tests: { viewportBefore: viewportSize(window), viewportWithKeyboard: null, audio: { created: 'suspended', afterTap: null }, memory: null, memoryRunning: false, canvas: new Map() },
    });
    const report = formatReport(sections);
    const rows = (title: string): Record<string, string> => Object.fromEntries(sections.find((section) => section.title === title)?.rows ?? []);

    expect(sections.map(({ title }) => title)).toEqual([...REPORT_SECTIONS]);
    expect(rows('Images')['Derived pictures on this thread']).toBe(WEBKIT ? 'PNG' : 'WEBP');
    expect(rows('Images')['Image worker']).toMatch(WEBKIT ? /^first job \d+ ms, encoded image\/png$/ : /^first job \d+ ms, encoded image\/webp$/);
    expect(rows('Images')['Image worker, second job']).toMatch(/^\d+ ms$/);
    expect(rows('Canvas')['4096 × 4096']).toBe('draws');
    expect(['draws', 'blank', 'refused']).toContain(rows('Canvas')['8192 × 8192']);
    expect(Number(rows('WebGL 2').MAX_TEXTURE_SIZE)).toBeGreaterThanOrEqual(4096);
    expect(rows('WebGL 2')['Lighting targets that cannot be rendered into']).toBe('none');
    expect(rows('WebGL 2')['Lighting shaders that do not link']).toBe('none');
    expect(rows('Storage').IndexedDB).toBe('yes');
    expect(report).not.toContain('Dragon');
    expect(report).not.toContain('Hidden Vale');
  });

  it('takes memory that is really there', () => {
    const block = takeMemory(8 * 1024 * 1024);

    expect(block.byteLength).toBe(8 * 1024 * 1024);
    expect(block[4096]).toBe(1);
  });
});
