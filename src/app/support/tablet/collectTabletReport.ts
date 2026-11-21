import { Platform, type App, type PluginManifest } from 'obsidian';
import { deviceProfile } from '../../platform/deviceProfile';
import { vaultBasePath } from '../../platform/vaultBasePath';
import { resourceUrlToVaultPath } from '../../utils/pathUtils';
import { collectDiagnostics } from '../diagnostics';
import {
  apiSection, keyboardSection, platformSection, pointerSection, resourceSection, storageFacts, storageSection, viewportSection,
  type ResourceSample, type ViewportSize,
} from './deviceProbes';
import { CANVAS_QUICK_SIDES, canvasSection, imagesSection, type CanvasAnswer, type ImageFacts } from './graphicsProbes';
import { memorySection, type MemoryRecord } from './memoryProbe';
import { section, type ReportSection } from './reportModel';

/** The probes that need a real browser: the dialog hands in this web view's, a test its own. */
export interface TabletProbes {
  images: () => Promise<ImageFacts>;
  canvas: (side: number) => CanvasAnswer;
  webgl: () => ReportSection;
}

/** What the dialog's own tests found so far; each is unset until its test ran. */
export interface TabletTests {
  /** The viewport when the dialog opened, before any input was focused. */
  viewportBefore: ViewportSize;
  /** The viewport with the dialog's field focused. */
  viewportWithKeyboard: ViewportSize | null;
  /** The state of an audio context made when the dialog opened, and after the tester tapped Test sound. */
  audio: { created: string; afterTap: string | null };
  memory: MemoryRecord | null;
  memoryRunning: boolean;
  /** Canvas sides asked beyond the quick ones. */
  canvas: ReadonlyMap<number, CanvasAnswer>;
}

export interface TabletReportInput {
  app: App;
  manifest: PluginManifest;
  win: Window;
  probes: TabletProbes;
  tests: TabletTests;
}

/**
 * What `getResourcePath` answers for a file of the vault and whether Atlas reads the file back
 * from it. The file's path is used for the comparison alone and never leaves this function.
 */
export function resourceSample(app: App): ResourceSample | null {
  const file = app.vault.getFiles()[0];
  if (!file) return null;
  const url = app.vault.getResourcePath(file);
  return { url, readBack: resourceUrlToVaultPath(url, vaultBasePath(app.vault.adapter)) === file.path };
}

function versionsSection(app: App, manifest: PluginManifest): ReportSection {
  const diagnostics = collectDiagnostics(app, manifest);
  return section('Versions', [
    ['Atlas VTT', diagnostics.pluginVersion],
    ['Obsidian', diagnostics.electronVersion ? `${diagnostics.obsidianVersion} (Electron ${diagnostics.electronVersion})` : diagnostics.obsidianVersion],
    ['System', `${diagnostics.system}, language ${diagnostics.language}`],
  ]);
}

export function audioSection(audio: TabletTests['audio']): ReportSection {
  return section('Audio', [
    ['A context made when the dialog opened', audio.created],
    ['After a tap on Test sound', audio.afterTap ?? 'not tested'],
  ]);
}

function lightingSection(): ReportSection {
  return section('Lighting', [
    ['Finest quality Atlas picks here', deviceProfile().budgets.lightingQualityDefault],
    ['Frame time per quality', 'not measured: the lighting engine reports no frame times yet'],
  ]);
}

/** Every section of the report, in the order of `REPORT_SECTIONS`. Nothing of the vault is in it. */
export async function collectTabletReport({ app, manifest, win, probes, tests }: TabletReportInput): Promise<ReportSection[]> {
  const profile = deviceProfile();
  const canvas = new Map<number, CanvasAnswer>(tests.canvas);
  for (const side of CANVAS_QUICK_SIDES) canvas.set(side, probes.canvas(side));
  const [images, storage] = await Promise.all([
    probes.images(),
    storageFacts(win.navigator, Reflect.get(win, 'indexedDB') !== undefined),
  ]);
  return [
    versionsSection(app, manifest),
    platformSection(Platform, win.navigator.userAgent, { memoryClass: profile.memoryClass, pointer: profile.pointer }),
    resourceSection(Platform.resourcePathPrefix, resourceSample(app)),
    pointerSection(win),
    viewportSection(win),
    keyboardSection(tests.viewportBefore, tests.viewportWithKeyboard),
    imagesSection(images),
    canvasSection(canvas),
    probes.webgl(),
    storageSection(storage),
    apiSection(win),
    audioSection(tests.audio),
    memorySection(tests.memory, tests.memoryRunning),
    lightingSection(),
  ];
}
