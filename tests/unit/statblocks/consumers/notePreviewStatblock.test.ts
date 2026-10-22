// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';

/** The windows a hover opened, by kind and note. */
const opened = vi.hoisted(() => [] as Array<{ kind: 'statblock' | 'note'; notePath: string }>);

vi.mock('../../../../src/app/services/StatblockPreviewWindow', () => ({
  StatblockPreviewWindow: class {
    element = document.body.createDiv();
    originatingPin: { id: string } | null;
    constructor(_app: unknown, public notePath: string, pin: { id: string }) {
      this.originatingPin = pin;
      opened.push({ kind: 'statblock', notePath });
    }
    setPosition(): void {}
    getIsPinned(): boolean { return false; }
    hide(): void { this.element.remove(); }
  },
}));
vi.mock('../../../../src/app/services/NotePreviewWindow', () => ({
  NotePreviewWindow: class {
    element = document.body.createDiv();
    constructor(_app: unknown, public notePath: string, public originatingPin: { id: string }) {
      opened.push({ kind: 'note', notePath });
    }
    setPosition(): void {}
    getIsPinned(): boolean { return false; }
    hide(): void { this.element.remove(); }
    saveStateNow(): void {}
  },
}));

import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { NotePreviewUIManager } from '../../../../src/app/services/NotePreviewUIManager';

const VIEW_ID = 'statblock-predicate-preview';
const FENCE = 'Bestiary/Orc.md';
const NATIVE = 'Bestiary/Marsh Warden.md';
const PLAIN = 'Notes/Tavern.md';
const GOBLIN = 'Bestiary/Goblin Chief.md';

let manager: NotePreviewUIManager;
let eventBus: EventEmitter;

function hoverToken(notePath: string): void {
  eventBus.emit('pin-hover-preview', {
    pin: { id: `token-${notePath}`, notePath, x: 0, y: 0, type: 'token', name: 'Orc' },
    screenX: 100,
    screenY: 100,
    pixiEvent: { metaKey: true, ctrlKey: false },
  });
}

/** Lets the hover read the note it decides on. */
const settle = (): Promise<void> => vi.waitFor(() => expect(opened.length).toBeGreaterThan(0));

beforeEach(() => {
  opened.length = 0;
  Platform.isMacOS = true;
  const { app } = createInMemoryApp({
    files: {
      [FENCE]: '# Orc\n\n```statblock\nname: Orc\nhp: 15\n```',
      [NATIVE]: '---\nstatblock: true\n---',
      [PLAIN]: '# The Tavern',
      [GOBLIN]: '---\nstatblock: true\n---\n```statblock\ncreature: Goblin Chief\n```',
    },
  });
  const frontmatter: Record<string, Record<string, unknown>> = {
    [NATIVE]: { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden' },
    [GOBLIN]: { statblock: true, name: 'Goblin Chief' },
  };
  app.metadataCache.getFileCache = vi.fn((file: { path: string }) => (frontmatter[file.path] ? { frontmatter: frontmatter[file.path] } : null));
  Object.assign(app.workspace, { getLeavesOfType: () => [], on: () => ({}) });
  eventBus = new EventEmitter();
  manager = new NotePreviewUIManager(app, eventBus, createViewAtlasStore(app, VIEW_ID), VIEW_ID);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  manager.destroy();
  document.body.empty();
  Platform.isMacOS = false;
});

describe('the token hover preview decides with the statblock predicate', () => {
  it('shows a token linked to a note with only a statblock fence as a statblock, without Fantasy Statblocks', async () => {
    hoverToken(FENCE);
    await settle();
    expect(opened).toEqual([{ kind: 'statblock', notePath: FENCE }]);
  });

  it('shows a token linked to a native statblock as a statblock at once', () => {
    hoverToken(NATIVE);
    expect(opened).toEqual([{ kind: 'statblock', notePath: NATIVE }]);
  });

  it('shows a token linked to a plain note as the note', async () => {
    hoverToken(PLAIN);
    await settle();
    expect(opened).toEqual([{ kind: 'note', notePath: PLAIN }]);
  });

  it('opens nothing when the preview was hidden while the note was read', async () => {
    hoverToken(FENCE);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(opened).toEqual([]);
  });
});

describe('a frontmatter statblock while Fantasy Statblocks is loaded', () => {
  /** Fantasy Statblocks with "Parse Frontmatter" off, its default: the bestiary holds only `parsed`. */
  function loadFantasyStatblocks(parsed: Array<{ name: string; path?: string }> = []): void {
    Object.assign(window, { FantasyStatblocks: {
      getBestiaryCreatures: () => parsed,
      hasCreature: (name: string) => parsed.some((creature) => creature.name === name),
      getCreatureFromBestiary: (name: string) => parsed.find((creature) => creature.name === name) ?? null,
    } });
  }

  it('shows the note, as before, while the plugin has not parsed it', async () => {
    loadFantasyStatblocks();
    hoverToken(GOBLIN);
    await settle();
    expect(opened).toEqual([{ kind: 'note', notePath: GOBLIN }]);
  });

  it('shows the statblock once the plugin knows the note, and a native note in any case', async () => {
    loadFantasyStatblocks([{ name: 'Goblin Chief', path: GOBLIN }]);
    hoverToken(GOBLIN);
    hoverToken(NATIVE);
    await settle();
    expect(opened).toEqual([{ kind: 'statblock', notePath: GOBLIN }, { kind: 'statblock', notePath: NATIVE }]);
  });

  it('shows the statblock without the plugin, which Atlas then draws itself', async () => {
    hoverToken(GOBLIN);
    await settle();
    expect(opened).toEqual([{ kind: 'statblock', notePath: GOBLIN }]);
  });
});
