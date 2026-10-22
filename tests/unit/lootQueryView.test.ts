// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, MarkdownRenderer, type Plugin } from 'obsidian';
import { LOOT_QUERY_VIEW } from '../../src/app/loot/lootBaseQuery';
import {
  LOOT_VIEW_GRACE_MS,
  LootBaseQuery,
  lootBasesAvailable,
  registerLootQueryView,
  type LootQueryListener,
} from '../../src/app/loot/lootQueryView';

/** The parts of Obsidian's `BasesView` the loot view reads, set on it by the tests. */
interface ViewData {
  data: { data: unknown[] };
  allProperties: string[];
  config: { getOrder: () => string[]; getDisplayName: (id: string) => string };
  onDataUpdated: () => void;
}

type Factory = (controller: unknown, containerEl: HTMLElement) => ViewData;

let factory: Factory | undefined;
/** Whether Obsidian's Bases core plugin takes registrations, as `Plugin.registerBasesView` checks. */
let basesEnabled = true;
const registerBasesView = vi.fn((_id: string, registration: { factory: Factory }) => {
  if (!basesEnabled) return false;
  factory = registration.factory;
  return true;
});

/** Makes Obsidian's view for each rendered code block, as Bases does while it is on. */
function basesOn(): ViewData[] {
  const views: ViewData[] = [];
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, _markdown, el) => {
    if (factory) views.push(factory({}, el.createDiv()));
    return Promise.resolve();
  });
  return views;
}

/** Leaves the code block as plain code, as Obsidian does without Bases. */
function basesOff(): void {
  vi.spyOn(MarkdownRenderer, 'render').mockResolvedValue();
}

function entry(path: string, values: Record<string, string | null>): unknown {
  return {
    file: { path, basename: path.split('/').pop()?.replace(/\.md$/, '') },
    getValue: (id: string) => {
      const value = values[id];
      return value === undefined ? null : { toString: () => String(value) };
    },
  };
}

function listener(): LootQueryListener & { onSnapshot: ReturnType<typeof vi.fn>; onUnavailable: ReturnType<typeof vi.fn> } {
  return { onSnapshot: vi.fn(), onUnavailable: vi.fn() };
}

const CONFIG = { views: [{ type: LOOT_QUERY_VIEW, name: 'Armor' }] };

beforeEach(() => {
  basesEnabled = true;
  registerBasesView.mockClear();
  registerLootQueryView({ registerBasesView } as unknown as Plugin);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('registerLootQueryView', () => {
  it('registers Atlas’s view type with Bases', () => {
    expect(registerBasesView).toHaveBeenCalledWith(LOOT_QUERY_VIEW, expect.objectContaining({ name: 'Atlas loot' }));
    expect(lootBasesAvailable()).toBe(true);
  });

  it('registers once Bases has come on, when Obsidian started Atlas before it', () => {
    basesEnabled = false;
    registerLootQueryView({ registerBasesView } as unknown as Plugin);
    expect(lootBasesAvailable()).toBe(false);

    basesEnabled = true;
    expect(lootBasesAvailable()).toBe(true);

    // Registered for good: it is not registered a second time.
    registerBasesView.mockClear();
    expect(lootBasesAvailable()).toBe(true);
    expect(registerBasesView).not.toHaveBeenCalled();
  });

  it('explains itself in a base someone opens on their own', () => {
    const containerEl = document.body.createDiv();
    const view = factory?.({}, containerEl);
    expect(containerEl.textContent).toContain('Atlas reads this view for its loot roller');
    expect(() => view?.onDataUpdated()).not.toThrow();
  });
});

describe('LootBaseQuery', () => {
  it('renders the base config off screen with Atlas’s view type', async () => {
    const render = vi.spyOn(MarkdownRenderer, 'render').mockResolvedValue();
    await new LootBaseQuery(new App(), CONFIG, 'Items.base', listener()).start();

    const [, markdown, host, sourcePath] = render.mock.calls[0] ?? [];
    expect(markdown).toMatch(/^```base\n[\s\S]*type: atlas-loot[\s\S]*```$/);
    expect(host?.classList.contains('atlas-loot-query-host')).toBe(true);
    expect(sourcePath).toBe('Items.base');
  });

  it('passes on every result of its view, with its columns and the properties the roller reads by name', async () => {
    const views = basesOn();
    const events = listener();
    await new LootBaseQuery(new App(), CONFIG, 'Items.base', events).start();
    const view = views[0];
    if (!view) throw new Error('no view');

    view.config = { getOrder: () => ['file.name', 'note.price'], getDisplayName: (id) => (id === 'note.price' ? 'Price' : id) };
    view.allProperties = ['note.price', 'note.rarity', 'note.weight', 'note.type'];
    view.data = { data: [entry('Items/Plate.md', { 'file.name': 'Plate', 'note.price': '300', 'note.rarity': 'Rare', 'note.weight': '40', 'note.type': null })] };
    view.onDataUpdated();

    expect(events.onSnapshot).toHaveBeenCalledWith({
      entries: [{ path: 'Items/Plate.md', name: 'Plate', values: { 'file.name': 'Plate', 'note.price': '300', 'note.rarity': 'Rare' } }],
      order: ['file.name', 'note.price'],
      displayNames: { 'file.name': 'file.name', 'note.price': 'Price', 'note.rarity': 'note.rarity', 'note.type': 'note.type' },
    });
  });

  it('reports an unavailable view when Obsidian makes none', async () => {
    vi.useFakeTimers();
    basesOff();
    const events = listener();
    await new LootBaseQuery(new App(), CONFIG, 'Items.base', events).start();

    vi.advanceTimersByTime(LOOT_VIEW_GRACE_MS - 1);
    expect(events.onUnavailable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(events.onUnavailable).toHaveBeenCalledOnce();
  });

  it('does not report a view Obsidian made', async () => {
    vi.useFakeTimers();
    basesOn();
    const events = listener();
    await new LootBaseQuery(new App(), CONFIG, 'Items.base', events).start();

    vi.advanceTimersByTime(LOOT_VIEW_GRACE_MS);
    expect(events.onUnavailable).not.toHaveBeenCalled();
  });

  it('removes its host and stops listening when stopped', async () => {
    vi.useFakeTimers();
    const views = basesOn();
    const events = listener();
    const query = new LootBaseQuery(new App(), CONFIG, 'Items.base', events);
    await query.start();
    query.stop();

    expect(document.querySelector('.atlas-loot-query-host')).toBeNull();
    vi.advanceTimersByTime(LOOT_VIEW_GRACE_MS);
    expect(events.onUnavailable).not.toHaveBeenCalled();

    // A view made for the removed host no longer finds the query.
    const orphan = factory?.({}, document.body.createDiv());
    orphan?.onDataUpdated();
    expect(events.onSnapshot).not.toHaveBeenCalled();
    expect(views).toHaveLength(1);
  });

  it('gives up its grace timer when stopped before Obsidian answered', async () => {
    vi.useFakeTimers();
    basesOff();
    const events = listener();
    const query = new LootBaseQuery(new App(), CONFIG, 'Items.base', events);
    await query.start();
    query.stop();

    vi.advanceTimersByTime(LOOT_VIEW_GRACE_MS);
    expect(events.onUnavailable).not.toHaveBeenCalled();
  });
});
