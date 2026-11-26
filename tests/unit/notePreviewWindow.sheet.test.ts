// @vitest-environment jsdom
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';
import { installPointerEvents, pointerEvent } from '../helpers/pointerEvents';

const device = vi.hoisted(() => ({ isMobileApp: true }));
const motion = vi.hoisted(() => ({ entered: [] as HTMLElement[], left: [] as HTMLElement[] }));

vi.mock('../../src/app/platform/deviceProfile', () => ({ deviceProfile: () => device }));
// jsdom animates nothing: the panel is told to enter, and leaves at once.
vi.mock('../../src/app/ui/panelMotion', () => ({
  animatePanelIn: (panel: HTMLElement) => { motion.entered.push(panel); },
  animatePanelOutAndRemove: (panel: HTMLElement, onRemoved?: () => void) => {
    motion.left.push(panel);
    panel.remove();
    onRemoved?.();
  },
}));

import { NotePreviewWindow } from '../../src/app/services/NotePreviewWindow';

const NOTE = 'notes/Greywater.md';

interface Harness {
  window: NotePreviewWindow;
  manager: { handlePreviewClosed: ReturnType<typeof vi.fn>; handlePreviewStateChanged: ReturnType<typeof vi.fn>; handlePreviewDismissed: ReturnType<typeof vi.fn> };
  getLeaf: ReturnType<typeof vi.fn>;
}

/** A note preview over a map leaf, in a workspace whose `getLeaf` answers as the test says. */
function openPreview(getLeaf: () => WorkspaceLeaf): Harness {
  const leafRoot = document.body.createDiv({ cls: 'workspace-leaf' });
  const atlasLeaf = new WorkspaceLeaf();
  atlasLeaf.view = { containerEl: leafRoot.createDiv({ cls: 'view-content' }) };
  const leafSource = vi.fn(getLeaf);
  const app = {
    vault: { read: vi.fn(async () => 'The road to Greywater'), getAbstractFileByPath: vi.fn((path: string) => new TFile(path)) },
    metadataCache: { getFileCache: vi.fn(() => null) },
    workspace: { getActiveViewOfType: vi.fn(() => null), getLeaf: leafSource, setActiveLeaf: vi.fn() },
  };
  const manager = { handlePreviewClosed: vi.fn(), handlePreviewStateChanged: vi.fn(), handlePreviewDismissed: vi.fn() };
  const window = new NotePreviewWindow(app as never, NOTE, { id: 'pin-1', notePath: NOTE } as never, manager as never, { x: 120, y: 80 }, atlasLeaf);
  return { window, manager, getLeaf: leafSource };
}

const noLeaf = (): never => {
  throw new Error('No tab group found.');
};

beforeEach(() => {
  installPointerEvents();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  motion.entered.length = 0;
  motion.left.length = 0;
});

afterEach(() => {
  NotePreviewWindow.openWindows.forEach((open) => open.hide(true));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.empty();
  device.isMobileApp = true;
});

describe('a note preview on mobile', () => {
  it('is a sheet over the map: no resize handles, and its header moves nothing', () => {
    const { window: preview } = openPreview(noLeaf);
    const sheet = preview.element!;
    expect(sheet.classList.contains('atlas-note-preview-window--sheet')).toBe(true);
    expect(sheet.querySelectorAll('.atlas-note-preview-resize-handle')).toHaveLength(0);
    expect(motion.entered).toEqual([sheet]);

    const header = sheet.querySelector<HTMLElement>('.atlas-note-preview-header')!;
    const before = [sheet.style.left, sheet.style.top];
    header.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 20, pointerType: 'touch' }));
    document.dispatchEvent(pointerEvent('pointermove', { clientX: 380, clientY: 90, pointerType: 'touch' }));
    document.dispatchEvent(pointerEvent('pointerup', { pointerType: 'touch' }));
    expect([sheet.style.left, sheet.style.top]).toEqual(before);
    expect(sheet.classList.contains('is-dragging')).toBe(false);
  });

  it('shows the note rendered where the workspace gives it no leaf, instead of closing', async () => {
    const { window: preview, manager, getLeaf } = openPreview(noLeaf);
    await waitFor(() => expect(preview.element?.querySelector('.atlas-note-preview-content')?.textContent).toBe('The road to Greywater'));
    expect(getLeaf).toHaveBeenCalled();
    expect(manager.handlePreviewClosed).not.toHaveBeenCalled();
  });

  it('closes by its close button with the panels\' motion', () => {
    const { window: preview, manager } = openPreview(noLeaf);
    const sheet = preview.element!;
    sheet.querySelector<HTMLElement>('.atlas-note-preview-close-btn')!.click();
    expect(motion.left).toEqual([sheet]);
    expect(manager.handlePreviewDismissed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.atlas-note-preview-window')).toBeNull();
    expect(preview.element).toBeNull();
  });

  it('pinned as a sheet keeps a window\'s place for the map to save, never the sheet\'s own', () => {
    const { window: preview } = openPreview(noLeaf);
    preview.element!.querySelector<HTMLElement>('.atlas-note-preview-pin-btn')!.click();
    expect(preview.toPinnedNotePreview()).toMatchObject({ anchorId: 'pin-1', notePath: NOTE, left: 10, top: 10, width: 400, height: 400 });
  });
});

describe('a note preview on desktop', () => {
  it('is a window with resize handles that its header moves, and closes when the workspace gives it no leaf', async () => {
    device.isMobileApp = false;
    const { window: preview, manager } = openPreview(noLeaf);
    const element = preview.element!;
    expect(element.classList.contains('atlas-note-preview-window--sheet')).toBe(false);
    expect(element.querySelectorAll('.atlas-note-preview-resize-handle')).toHaveLength(8);
    expect(motion.entered).toEqual([]);

    const header = element.querySelector<HTMLElement>('.atlas-note-preview-header')!;
    header.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 20 }));
    expect(element.classList.contains('is-dragging')).toBe(true);
    document.dispatchEvent(pointerEvent('pointerup'));

    await waitFor(() => expect(manager.handlePreviewClosed).toHaveBeenCalledTimes(1));
    expect(motion.left).toEqual([]);
  });
});
