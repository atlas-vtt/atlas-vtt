// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Platform, WorkspaceLeaf } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../src/app/services/NotePreviewUIManager';

const VIEW_ID = 'hover-context-test';

type LeafChangeHandler = (leaf: WorkspaceLeaf | null) => void;

interface ManagerHarness {
  manager: NotePreviewUIManager;
  eventBus: EventEmitter;
  showPreview: Mock;
  ownLeaf: WorkspaceLeaf;
  activateLeaf: (leaf: WorkspaceLeaf) => void;
}

function createLeaf(viewType: string, viewId?: string): WorkspaceLeaf {
  const leaf = new WorkspaceLeaf();
  leaf.view = { viewId, getViewType: () => viewType };
  return leaf;
}

function createHarness(): ManagerHarness {
  const { app } = createInMemoryApp();
  let leafChangeHandler: LeafChangeHandler | null = null;
  const ownLeaf = createLeaf('atlas-vtt', VIEW_ID);
  Object.assign(app.workspace, {
    getLeavesOfType: vi.fn((type: string) => (type === 'atlas-vtt' ? [ownLeaf] : [])),
    on: vi.fn((name: string, handler: LeafChangeHandler) => {
      if (name === 'active-leaf-change') leafChangeHandler = handler;
      return {};
    }),
  });

  const eventBus = new EventEmitter();
  const manager = new NotePreviewUIManager(app, eventBus, createViewAtlasStore(app, VIEW_ID), VIEW_ID);
  const showPreview = vi.fn(async () => undefined);
  manager.showOrCreatePreview = showPreview;

  const activateLeaf = (leaf: WorkspaceLeaf): void => leafChangeHandler?.(leaf);

  return { manager, eventBus, showPreview, ownLeaf, activateLeaf };
}

function hoverPin(eventBus: EventEmitter): void {
  eventBus.emit('pin-hover-preview', {
    pin: { id: 'pin-1', notePath: 'Notes/Tavern.md', x: 0, y: 0 },
    screenX: 100,
    screenY: 100,
  });
}

function pressModifier(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }));
}

function releaseModifier(): void {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
}

describe('NotePreviewUIManager hover replay', () => {
  let harness: ManagerHarness;

  beforeEach(() => {
    Platform.isMacOS = true;
    harness = createHarness();
  });

  afterEach(() => {
    harness.manager.destroy();
    Platform.isMacOS = false;
  });

  it('opens the preview when CMD is pressed while an element is hovered', () => {
    hoverPin(harness.eventBus);
    pressModifier();

    expect(harness.showPreview).toHaveBeenCalledTimes(1);
  });

  it('ignores Ctrl on macOS, where Ctrl+click is a right click', () => {
    hoverPin(harness.eventBus);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));

    expect(harness.showPreview).not.toHaveBeenCalled();
  });

  it('does not replay the previous map\'s hover after another map loads', () => {
    hoverPin(harness.eventBus);
    pressModifier();
    releaseModifier();

    harness.eventBus.emit('map-loaded', {});
    pressModifier();

    expect(harness.showPreview).toHaveBeenCalledTimes(1);
  });

  it('does not replay the hover after switching to a non-Atlas tab', () => {
    hoverPin(harness.eventBus);

    harness.activateLeaf(createLeaf('markdown'));
    pressModifier();

    expect(harness.showPreview).not.toHaveBeenCalled();
  });

  it('does not replay the hover after switching to another map\'s tab', () => {
    hoverPin(harness.eventBus);

    harness.activateLeaf(createLeaf('atlas-vtt', 'other-view'));
    pressModifier();

    expect(harness.showPreview).not.toHaveBeenCalled();
  });

  it('keeps the hover when its own map becomes active again', () => {
    hoverPin(harness.eventBus);

    harness.activateLeaf(harness.ownLeaf);
    pressModifier();

    expect(harness.showPreview).toHaveBeenCalledTimes(1);
  });
});
