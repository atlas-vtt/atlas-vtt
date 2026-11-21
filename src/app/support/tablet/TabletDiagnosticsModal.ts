import { Modal, type App, type PluginManifest } from 'obsidian';
import { t } from '../../i18n';
import { createAtlasButton } from '../../ui/atlasButton';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../ui/nativeModal';
import { showNotice } from '../../ui/notice';
import { runInBackground } from '../../utils/backgroundTask';
import { browserProbes } from './browserProbes';
import { audioSection, collectTabletReport, type TabletProbes, type TabletTests } from './collectTabletReport';
import { keyboardSection, viewportSize } from './deviceProbes';
import { CANVAS_HEAVY_SIDE, canvasSection, CANVAS_QUICK_SIDES, type CanvasAnswer } from './graphicsProbes';
import { memorySection, readMemoryRecord, runMemoryTest, takeMemory, type MemoryRecord } from './memoryProbe';
import { formatReport, withSection, type ReportSection } from './reportModel';

/** Where the memory test's last step is kept on the device, so a test the system ended can still be read. */
const MEMORY_RECORD_KEY = 'atlas-vtt:tablet-memory-test';
/** How long a keyboard takes to come up and the page to settle under it. */
const KEYBOARD_SETTLE_MS = 1000;
/** Between two steps of the memory test: the page draws, and the system sees what the web view holds. */
const MEMORY_PAUSE_MS = 60;

function audioState(context: AudioContext | null): string {
  return context ? context.state : 'no AudioContext';
}

/**
 * The Tablet diagnostics dialog: the report as text to select, copy or share, and the three tests
 * only a tester's hand can run (the keyboard, a tap for sound, the memory test).
 */
export class TabletDiagnosticsModal extends Modal {
  private sections: ReportSection[] = [];
  private reportEl: HTMLElement | undefined;
  private audio: AudioContext | null = null;
  private tests: TabletTests | undefined;
  private closed = false;

  constructor(app: App, private readonly manifest: PluginManifest, private readonly probes: TabletProbes = browserProbes()) {
    super(app);
  }

  onOpen(): void {
    const win = this.contentEl.win;
    this.setTitle(t('tabletDiag.title'));
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-tablet-diag-modal');
    this.audio = typeof AudioContext === 'function' ? new AudioContext() : null;
    this.tests = {
      viewportBefore: viewportSize(win),
      viewportWithKeyboard: null,
      audio: { created: audioState(this.audio), afterTap: null },
      memory: readMemoryRecord(this.app.loadLocalStorage(MEMORY_RECORD_KEY)),
      memoryRunning: false,
      canvas: new Map(),
    };
    this.contentEl.createEl('p', { cls: 'atlas-tablet-diag__intro', text: t('tabletDiag.intro') });
    this.renderTests(this.contentEl.createDiv({ cls: 'atlas-tablet-diag__tests' }), this.tests);
    this.reportEl = this.contentEl.createEl('pre', { cls: 'atlas-tablet-diag__report', text: t('tabletDiag.collecting') });
    this.renderActions(this.contentEl.createDiv({ cls: 'atlas-tablet-diag__actions' }));
    runInBackground(this.collect(this.tests), 'Collecting the tablet diagnostics');
  }

  onClose(): void {
    this.closed = true;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
    this.contentEl.empty();
  }

  private async collect(tests: TabletTests): Promise<void> {
    const sections = await collectTabletReport({ app: this.app, manifest: this.manifest, win: this.contentEl.win, probes: this.probes, tests });
    // What a test found while the report was collected stays.
    this.sections = [keyboardSection(tests.viewportBefore, tests.viewportWithKeyboard), audioSection(tests.audio), memorySection(tests.memory, tests.memoryRunning)]
      .reduce(withSection, sections);
    this.show();
  }

  private put(next: ReportSection): void {
    if (this.sections.length === 0) return;
    this.sections = withSection(this.sections, next);
    this.show();
  }

  private show(): void {
    if (!this.closed) this.reportEl?.setText(formatReport(this.sections));
  }

  private renderTests(host: HTMLElement, tests: TabletTests): void {
    const field = host.createEl('input', { cls: 'atlas-tablet-diag__field', attr: { type: 'text', placeholder: t('tabletDiag.keyboardField'), 'aria-label': t('tabletDiag.keyboardField') } });
    field.addEventListener('focus', () => {
      field.win.setTimeout(() => {
        if (this.closed || field.doc.activeElement !== field) return;
        tests.viewportWithKeyboard = viewportSize(field.win);
        this.put(keyboardSection(tests.viewportBefore, tests.viewportWithKeyboard));
        field.blur();
      }, KEYBOARD_SETTLE_MS);
    });
    const buttons = host.createDiv({ cls: 'atlas-tablet-diag__buttons' });
    createAtlasButton(buttons, { text: t('tabletDiag.testSound'), variant: 'outline', size: 'sm', onClick: () => this.testSound(tests) });
    const memory = createAtlasButton(buttons, { text: t('tabletDiag.runMemoryTest'), variant: 'outline', size: 'sm', onClick: () => runInBackground(this.testMemory(tests, memory), 'Running the memory test') });
    host.createEl('p', { cls: 'atlas-tablet-diag__warning', text: t('tabletDiag.memoryWarning') });
  }

  private testSound(tests: TabletTests): void {
    const context = this.audio;
    const said = (): void => {
      tests.audio = { ...tests.audio, afterTap: audioState(context) };
      this.put(audioSection(tests.audio));
    };
    if (!context) said();
    else context.resume().then(said, said);
  }

  private async testMemory(tests: TabletTests, button: HTMLButtonElement): Promise<void> {
    if (tests.memoryRunning) return;
    tests.memoryRunning = true;
    button.disabled = true;
    const win = button.win;
    const note = (record: MemoryRecord): void => {
      this.app.saveLocalStorage(MEMORY_RECORD_KEY, record);
      tests.memory = record;
      this.put(memorySection(record, record.ended === null));
    };
    try {
      await runMemoryTest({ allocate: takeMemory, record: note, pause: () => new Promise((resolve) => { win.setTimeout(resolve, MEMORY_PAUSE_MS); }) });
      // The largest canvas takes a gigabyte where it draws, so it is asked only here.
      const canvas = new Map<number, CanvasAnswer>([...CANVAS_QUICK_SIDES, CANVAS_HEAVY_SIDE].map((side) => [side, this.probes.canvas(side)]));
      tests.canvas = canvas;
      this.put(canvasSection(canvas));
    } finally {
      tests.memoryRunning = false;
      if (tests.memory) this.put(memorySection(tests.memory, false));
      button.disabled = false;
    }
  }

  private renderActions(host: HTMLElement): void {
    const nav = host.win.navigator;
    createAtlasButton(host, {
      text: t('common.copy'), size: 'sm',
      onClick: () => {
        nav.clipboard.writeText(formatReport(this.sections)).then(() => showNotice(t('tabletDiag.copied')), () => showNotice(t('tabletDiag.copyFailed')));
      },
    });
    if (typeof nav.share === 'function') {
      createAtlasButton(host, {
        text: t('deviceFiles.share'), variant: 'outline', size: 'sm',
        // A sheet the tester closes rejects too: nothing to say about it.
        onClick: () => { nav.share({ title: t('tabletDiag.title'), text: formatReport(this.sections) }).catch(() => undefined); },
      });
    }
    createAtlasButton(host, { text: t('common.close'), variant: 'outline', size: 'sm', onClick: () => this.close() });
  }
}
