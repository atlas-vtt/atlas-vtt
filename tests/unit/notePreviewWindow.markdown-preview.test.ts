// @vitest-environment jsdom
import { waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MarkdownRenderer, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { NotePreviewWindow } from '../../src/app/services/NotePreviewWindow';

function installDomHelpers(): void {
  (HTMLElement.prototype as any).empty = function empty(): void {
    this.innerHTML = '';
  };
  (HTMLElement.prototype as any).setText = function setText(value: string): void {
    this.textContent = value;
  };
  (HTMLElement.prototype as any).createDiv = function createDiv(options?: { cls?: string; text?: string }): HTMLDivElement {
    const el = document.createElement('div');
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).createSpan = function createSpan(options?: { cls?: string; text?: string }): HTMLSpanElement {
    const el = document.createElement('span');
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).createEl = function createEl(
    tag: string,
    options?: { cls?: string; text?: string },
  ): HTMLElement {
    const el = document.createElement(tag);
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };
}

interface PreviewHarness {
  app: {
    vault: { read: Mock; getAbstractFileByPath: Mock };
    metadataCache: { getFileCache: Mock };
    workspace: { getActiveViewOfType: Mock; getLeaf: Mock; setActiveLeaf: Mock };
  };
  /** Kept separately: the window swaps `workspace.setActiveLeaf` for a bound copy while it opens the note. */
  setActiveLeaf: Mock;
  atlasLeaf: WorkspaceLeaf;
  atlasLeafRoot: HTMLElement;
}

/** An Atlas map leaf mounted in the DOM plus a workspace that hands out `previewLeaf`. */
function createHarness(previewLeaf: WorkspaceLeaf | null): PreviewHarness {
  const atlasLeafRoot = document.createElement('div');
  atlasLeafRoot.className = 'workspace-leaf mod-active';
  const atlasLeafContainer = atlasLeafRoot.createDiv({ cls: 'view-content' });
  document.body.appendChild(atlasLeafRoot);

  const atlasLeaf = new WorkspaceLeaf();
  atlasLeaf.view = { containerEl: atlasLeafContainer };

  const setActiveLeaf = vi.fn();
  const app = {
    vault: {
      read: vi.fn(async () => 'Preview body'),
      getAbstractFileByPath: vi.fn((path: string) => new TFile(path)),
    },
    metadataCache: { getFileCache: vi.fn(() => null) },
    workspace: {
      getActiveViewOfType: vi.fn(() => null),
      getLeaf: vi.fn(() => previewLeaf),
      setActiveLeaf,
    },
  };

  return { app, setActiveLeaf, atlasLeaf, atlasLeafRoot };
}

function openPreview(harness: PreviewHarness, notePath: string): NotePreviewWindow {
  return new NotePreviewWindow(
    harness.app as never,
    notePath,
    { id: 'pin-1', notePath } as never,
    { handlePreviewClosed: vi.fn() } as never,
    { x: 120, y: 80 },
    harness.atlasLeaf,
  );
}

describe('NotePreviewWindow markdown previews', () => {
  let renderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installDomHelpers();
    renderSpy = vi.spyOn(MarkdownRenderer, 'render');
  });

  afterEach(() => {
    NotePreviewWindow.closeAllPreviews();
    renderSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('opens markdown notes in a detached leaf so the preview stays editable and the map stays active', async () => {
    const noteViewEl = document.createElement('div');
    const previewLeaf = new WorkspaceLeaf();
    previewLeaf.view = { containerEl: noteViewEl };
    const openFile = vi.fn(async () => undefined);
    const detach = vi.fn();
    Object.assign(previewLeaf, { openFile, detach });

    const harness = createHarness(previewLeaf);
    const preview = openPreview(harness, 'atlas-vtt/notes/Preview Note.md');

    await waitFor(() => {
      expect(preview.element?.contains(noteViewEl)).toBe(true);
    });

    expect(harness.app.workspace.getLeaf).toHaveBeenCalledWith(true);
    expect(detach).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'atlas-vtt/notes/Preview Note.md' }),
      { active: false },
    );
    expect(harness.setActiveLeaf).toHaveBeenLastCalledWith(harness.atlasLeaf, { focus: false });
    expect(renderSpy).not.toHaveBeenCalled();
    expect(harness.atlasLeafRoot.contains(preview.element!)).toBe(true);
  });

  it('keeps the keys typed in a note to itself, but lets the Mod key go, so what Mod shows hears it released (#501)', async () => {
    const harness = createHarness(null);
    const preview = openPreview(harness, 'atlas-vtt/notes/Pinned.md');
    const heard: string[] = [];
    const listen = (e: KeyboardEvent): void => {
      heard.push(`${e.type} ${e.key}`);
    };
    document.addEventListener('keydown', listen);
    document.addEventListener('keyup', listen);

    const inside = preview.element!.createDiv();
    inside.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    inside.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));

    expect(heard).toEqual(['keyup Control']);
    document.removeEventListener('keydown', listen);
    document.removeEventListener('keyup', listen);
  });

  /** A note view on Tavern.md whose cache lists "Cellar" on line 3 and "Room #3" on line 12. */
  function tavernPreview(): { view: MarkdownView; harness: PreviewHarness } {
    const previewLeaf = new WorkspaceLeaf();
    const view = new MarkdownView(previewLeaf);
    view.file = new TFile('atlas-vtt/notes/Tavern.md');
    view.contentEl.textContent = 'Tavern';
    previewLeaf.view = view;
    Object.assign(previewLeaf, { openFile: vi.fn(async () => undefined), detach: vi.fn() });

    const harness = createHarness(previewLeaf);
    harness.app.metadataCache.getFileCache.mockReturnValue({
      headings: [
        { heading: 'Cellar', level: 2, position: { start: { line: 3 } } },
        { heading: 'Room #3', level: 2, position: { start: { line: 12 } } },
      ],
    });
    return { view, harness };
  }

  it('scrolls the editor to a heading by its line, since the editor only draws the lines near the screen', async () => {
    const { view, harness } = tavernPreview();
    const lines = Array.from({ length: 20 }, (_, line) => `line ${line}`);
    lines[3] = '## Cellar';
    lines[12] = '## Room #3';
    const doc = EditorState.create({ doc: lines.join('\n') }).doc;
    const headingMarks = new RangeSetBuilder<Decoration>();
    [3, 12].forEach((line) => headingMarks.add(doc.line(line + 1).from, doc.line(line + 1).from, Decoration.line({ class: 'HyperMD-header' })));
    const editor = new EditorView({
      state: EditorState.create({ doc, extensions: EditorView.decorations.of(headingMarks.finish()) }),
      parent: view.containerEl,
    });
    const roomLine = editor.domAtPos(doc.line(13).from).node.parentElement!.closest<HTMLElement>('.cm-line')!;

    openPreview(harness, 'atlas-vtt/notes/Tavern.md#Room #3');

    await waitFor(() => {
      expect(roomLine.classList.contains('atlas-highlighted-header')).toBe(true);
    });
    expect(view.currentMode.getScroll()).toBe(12);
    expect(view.containerEl.classList.contains('atlas-embedded-leaf-view--pending-scroll')).toBe(false);
    editor.destroy();
  });

  it('finds the heading in reading view by its source text', async () => {
    const { view, harness } = tavernPreview();
    view.setMode('preview');
    const room = view.previewMode.containerEl.createEl('h2', { text: 'Room #3' });
    room.dataset.heading = 'Room #3';

    openPreview(harness, 'atlas-vtt/notes/Tavern.md#Room #3');

    await waitFor(() => {
      expect(room.classList.contains('atlas-highlighted-header')).toBe(true);
    });
    expect(view.currentMode.getScroll()).toBe(12);
  });

  it('falls back to rendering the markdown when the workspace cannot provide a leaf', async () => {
    const harness = createHarness(null);
    const preview = openPreview(harness, 'atlas-vtt/notes/Preview Note.md#Overview');

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    expect(renderSpy).toHaveBeenCalledWith(
      harness.app,
      'Preview body',
      expect.any(HTMLElement),
      'atlas-vtt/notes/Preview Note.md',
      expect.anything(),
    );
    expect(harness.setActiveLeaf).toHaveBeenLastCalledWith(harness.atlasLeaf, { focus: false });
    expect(preview.element?.textContent).toContain('Preview body');
    expect(harness.atlasLeafRoot.contains(preview.element!)).toBe(true);
  });
});
