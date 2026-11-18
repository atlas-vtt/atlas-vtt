// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, type PluginManifest } from 'obsidian';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { collectTabletReport, resourceSample, type TabletProbes, type TabletTests } from '../../../src/app/support/tablet/collectTabletReport';
import { keyboardResize, keyboardSection, resourceSection, urlHead, viewportSize, type ViewportSize } from '../../../src/app/support/tablet/deviceProbes';
import { canvasSection, imagesSection } from '../../../src/app/support/tablet/graphicsProbes';
import { MEMORY_STEP, memorySection, readMemoryRecord, runMemoryTest, type MemoryRecord } from '../../../src/app/support/tablet/memoryProbe';
import { REPORT_SECTIONS, formatReport, section, withSection } from '../../../src/app/support/tablet/reportModel';
import { collectDiagnostics } from '../../../src/app/support/diagnostics';

const manifest = { id: 'atlas-vtt', version: '0.17.1' } as PluginManifest;

const NOTE = 'Kampagne Schattenmoor/Geheime Notizen/Drachenhort.md';
const DISK = '/var/mobile/Containers/Data/Application/1F2E3D4C/Documents/Tresor-Alice';

const probes: TabletProbes = {
  images: async () => ({ mainThread: 'png', worker: { ms: 41.6, type: 'image/png' }, warmMs: 3.2 }),
  canvas: (side) => (side <= 4096 ? 'draws' : 'blank'),
  webgl: () => section('WebGL 2', [['MAX_TEXTURE_SIZE', '16384']]),
};

const viewport = (innerHeight: number, visualHeight: number): ViewportSize => ({ innerWidth: 1180, innerHeight, visual: { width: 1180, height: visualHeight, offsetTop: 0, scale: 1 } });

function tests(extra: Partial<TabletTests> = {}): TabletTests {
  return { viewportBefore: viewport(820, 820), viewportWithKeyboard: null, audio: { created: 'suspended', afterTap: null }, memory: null, memoryRunning: false, canvas: new Map(), ...extra };
}

/** A vault on an iPad's disk whose files are served under Capacitor's file URLs. */
function tabletApp(): ReturnType<typeof createInMemoryApp>['app'] {
  const { app } = createInMemoryApp({ files: { [NOTE]: '# Der Hort\nGold und Geheimnisse.' } });
  vi.mocked(app.vault.getResourcePath).mockImplementation((file) => `capacitor://localhost/_capacitor_file_${DISK}/${encodeURI(file.path)}?1700000000`);
  Reflect.set(app.vault.adapter, 'getFullPath', (path: string) => `${DISK}/${path}`);
  return app;
}

afterEach(() => {
  Platform.isMobile = false;
  Reflect.deleteProperty(Platform, 'isIosApp');
  Reflect.deleteProperty(Platform, 'isAndroidApp');
  Reflect.deleteProperty(Platform, 'isPhone');
  Reflect.deleteProperty(Platform, 'resourcePathPrefix');
});

describe('the tablet report', () => {
  it('has every section in its order, each with its answers', async () => {
    const sections = await collectTabletReport({ app: tabletApp(), manifest, win: window, probes, tests: tests() });

    expect(sections.map(({ title }) => title)).toEqual([...REPORT_SECTIONS]);
    expect(Object.fromEntries(sections.map(({ title, rows }) => [title, rows.map(([label]) => label)]))).toEqual({
      Versions: ['Atlas VTT', 'Obsidian', 'System'],
      Platform: ['Set', 'Not set', 'User agent', 'Atlas device profile'],
      'Resource URLs': ['Platform.resourcePathPrefix', 'A vault file\'s URL', 'It starts with the prefix', 'It carries a query', 'Atlas reads the file back from it'],
      Pointer: ['Media queries that match', 'maxTouchPoints'],
      Viewport: ['Window', 'Visual viewport', 'Screen', 'Device pixel ratio'],
      Keyboard: ['With an input focused'],
      Images: ['Derived pictures on this thread', 'Image worker', 'Image worker, second job'],
      Canvas: ['4096 × 4096', '8192 × 8192', '16384 × 16384'],
      'WebGL 2': ['MAX_TEXTURE_SIZE'],
      Storage: ['IndexedDB', 'Quota', 'In use', 'Persisted'],
      'Web APIs': ['Present', 'Missing'],
      Audio: ['A context made when the dialog opened', 'After a tap on Test sound'],
      Memory: ['Memory test'],
      Lighting: ['Finest quality Atlas picks here', 'Frame time per quality'],
    });
  });

  it('holds no path, file name or content of the vault', async () => {
    Reflect.set(Platform, 'resourcePathPrefix', 'capacitor://localhost/_capacitor_file_/');
    const app = tabletApp();

    const report = formatReport(await collectTabletReport({ app, manifest, win: window, probes, tests: tests() }));

    // The sample was read, so its absence below is the report's doing.
    expect(resourceSample(app)?.url).toContain('Drachenhort');
    for (const secret of ['Schattenmoor', 'Geheime', 'Notizen', 'Drachenhort', '.md', 'Tresor', 'Alice', '/var/mobile', '1F2E3D4C', 'Documents', 'Gold', '1700000000']) {
      expect(report).not.toContain(secret);
    }
    expect(report).toContain('- Platform.resourcePathPrefix: capacitor://localhost/_capacitor_file_/…');
    expect(report).toContain('- A vault file\'s URL: capacitor://localhost/_capacitor_file_/…');
    expect(report).toContain('- It starts with the prefix: yes');
    expect(report).toContain('- It carries a query: yes');
    expect(report).toContain('- Atlas reads the file back from it: yes');
  });

  it('says what the probes found', async () => {
    const report = formatReport(await collectTabletReport({ app: tabletApp(), manifest, win: window, probes, tests: tests() }));

    expect(report).toContain('### Images\n- Derived pictures on this thread: PNG\n- Image worker: first job 42 ms, encoded image/png\n- Image worker, second job: 3 ms');
    expect(report).toContain('### Canvas\n- 4096 × 4096: draws\n- 8192 × 8192: blank\n- 16384 × 16384: not tried: part of the memory test');
    expect(report).toContain('- Frame time per quality: not measured');
  });

  it('asks about no file in an empty vault', async () => {
    const { app } = createInMemoryApp();

    const report = formatReport(await collectTabletReport({ app, manifest, win: window, probes, tests: tests() }));

    expect(report).toContain('- A vault file: none to ask about');
  });
});

describe('how a resource URL begins', () => {
  it.each([
    ['app://4f9a2c/Users/alice/Vault/a.png?1', 'app://4f9a2c/…'],
    ['file:///var/mobile/Vault/a.png', 'file:///…'],
    ['capacitor://localhost/_capacitor_file_/var/mobile/Vault/a.png', 'capacitor://localhost/_capacitor_file_/…'],
    ['http://localhost/_capacitor_file_/storage/emulated/0/Vault/a.png', 'http://localhost/_capacitor_file_/…'],
    ['/Users/alice/Vault/a.png', 'no URL'],
  ])('%s is told as %s', (url, head) => {
    expect(urlHead(url)).toBe(head);
  });

  it('says so where Obsidian names no prefix', () => {
    expect(resourceSection(undefined, null).rows).toEqual([['Platform.resourcePathPrefix', 'not set'], ['A vault file', 'none to ask about']]);
  });
});

describe('what the keyboard does to the page', () => {
  it.each<[string, ViewportSize, ReturnType<typeof keyboardResize>]>([
    ['shortens the window', viewport(480, 480), 'window'],
    ['shortens the visual viewport alone', viewport(820, 470), 'visual'],
    ['changes nothing', viewport(820, 820), 'none'],
    ['changes too little to be a keyboard', viewport(790, 790), 'none'],
  ])('%s', (_what, after, mode) => {
    expect(keyboardResize(viewport(820, 820), after)).toBe(mode);
  });

  it('is read from the window as it is', () => {
    expect(viewportSize({ innerWidth: 1180, innerHeight: 820, visualViewport: null })).toEqual({ innerWidth: 1180, innerHeight: 820, visual: null });
  });

  it('is written with both sizes once the tester tapped the field', () => {
    expect(keyboardSection(viewport(820, 820), viewport(820, 470)).rows).toEqual([
      ['Window before, with keyboard', '1180 × 820, 1180 × 820'],
      ['Visual viewport before, with keyboard', '1180 × 820, offset top 0, scale 1; 1180 × 470, offset top 0, scale 1'],
      ['Resize mode', 'only the visual viewport gets shorter'],
    ]);
  });
});

describe('the memory test', () => {
  const run = (allocate: (bytes: number) => unknown, cap = 5 * MEMORY_STEP): Promise<{ result: MemoryRecord; notes: MemoryRecord[] }> => {
    const notes: MemoryRecord[] = [];
    return runMemoryTest({ allocate, record: (state) => notes.push(state), pause: () => Promise.resolve(), cap }).then((result) => ({ result, notes }));
  };

  it('takes memory a step at a time up to its cap and writes each step down before it is taken', async () => {
    const allocate = vi.fn((bytes: number) => bytes);

    const { result, notes } = await run(allocate);

    expect(allocate.mock.calls).toEqual(Array.from({ length: 5 }, () => [MEMORY_STEP]));
    expect(result).toEqual({ reached: 5 * MEMORY_STEP, ended: 'cap' });
    expect(notes).toEqual([
      ...Array.from({ length: 5 }, (_, step) => ({ reached: step * MEMORY_STEP, ended: null })),
      { reached: 5 * MEMORY_STEP, ended: 'cap' },
    ]);
  });

  it('stops where a step is refused', async () => {
    let steps = 0;

    const { result } = await run(() => { if (++steps > 3) throw new RangeError('Array buffer allocation failed'); });

    expect(result).toEqual({ reached: 3 * MEMORY_STEP, ended: 'refused' });
  });

  it('is read from its last note where the app reloaded under it', () => {
    const left = readMemoryRecord({ reached: 12 * MEMORY_STEP, ended: null });

    expect(memorySection(left, false).rows).toEqual([['Memory test', 'held 768 MiB, then the app reloaded during the next 64 MiB']]);
    expect(memorySection(left, true).rows).toEqual([['Memory test', 'running, holds 768 MiB']]);
    expect(memorySection({ reached: 24 * MEMORY_STEP, ended: 'cap' }, false).rows).toEqual([['Memory test', 'held 1536 MiB, the most it asks for']]);
    expect(memorySection({ reached: 3 * MEMORY_STEP, ended: 'refused' }, false).rows).toEqual([['Memory test', 'held 192 MiB; the next 64 MiB were refused']]);
    expect(memorySection(null, false).rows).toEqual([['Memory test', 'not run']]);
  });

  it.each([null, 'held', { reached: -1 }, { reached: Number.NaN, ended: 'cap' }])('takes a stored note that is none (%j) for no test', (stored) => {
    expect(readMemoryRecord(stored)).toBeNull();
  });
});

describe('the report as text', () => {
  it('is a heading and a list for each section', () => {
    expect(formatReport([section('Canvas', [['4096 × 4096', 'draws']]), section('Memory', [['Memory test', 'not run']])]))
      .toBe('### Canvas\n- 4096 × 4096: draws\n\n### Memory\n- Memory test: not run');
  });

  it('takes a section found later in the place of the one it had', () => {
    const before = [canvasSection(new Map()), imagesSection({ mainThread: 'webp', worker: { failed: 'TimeoutError' }, warmMs: null })];

    const after = withSection(before, canvasSection(new Map([[16384, 'refused']])));

    expect(after.map(({ title }) => title)).toEqual(['Canvas', 'Images']);
    expect(after[0]?.rows[2]).toEqual(['16384 × 16384', 'refused']);
    expect(after[1]?.rows[1]).toEqual(['Image worker', 'did not answer: TimeoutError']);
  });
});

describe('the system a report names', () => {
  it.each<[string, Record<string, boolean>]>([
    ['iPadOS', { isIosApp: true, isMacOS: true }],
    ['iOS', { isIosApp: true, isPhone: true, isMacOS: true }],
    ['Android', { isAndroidApp: true }],
  ])('is %s in Obsidian\'s mobile app', (system, flags) => {
    vi.stubGlobal('process', undefined);
    for (const [flag, value] of Object.entries(flags)) Reflect.set(Platform, flag, value);
    const { app } = createInMemoryApp();

    const diagnostics = collectDiagnostics(app, manifest);

    vi.unstubAllGlobals();
    Platform.isMacOS = false;
    expect(diagnostics.system).toBe(system);
  });
});
