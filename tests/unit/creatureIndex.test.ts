// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

async function settled(index: CreatureIndex): Promise<void> {
  await vi.waitFor(() => expect(index.isPending()).toBe(false));
}

let current: CreatureVault;
beforeEach(() => { current = creatureVault(); });
afterEach(() => {
  CreatureIndex.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  vi.useRealTimers();
});

describe('CreatureIndex', () => {
  it('reads statblocks from frontmatter, from fences, and knows notes without one', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md', 'Notes/Plain.md', 'Gone.md']);
    expect(index.isPending()).toBe(true);
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')).toMatchObject({ fields: { cr: '1/4', name: 'Goblin' }, lookName: 'Basic 5e Layout', templateId: null });
    expect(index.get('Bestiary/Orc.md')?.fields).toMatchObject({ name: 'Orc', cr: '1/2' });
    expect(index.get('Notes/Plain.md')).toBeNull();
    expect(index.get('Gone.md')).toBeNull();
    expect(index.get('Never/Asked.md')).toBeUndefined();
  });

  it('prefers the bestiary entry and scans the bestiary once per batch', async () => {
    current.bestiary.push({ name: 'Goblin Boss', path: 'Bestiary/Goblin.md', cr: 1 });
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md']);
    await settled(index);
    expect(index.get('Bestiary/Goblin.md')?.fields).toMatchObject({ name: 'Goblin Boss', cr: 1 });
    expect(current.getBestiaryCreatures).toHaveBeenCalledTimes(1);
  });

  it('gives the browser a turn while it resolves a large library from the bestiary', async () => {
    const paths = Array.from({ length: 400 }, (_, number) => `Bestiary/Creature ${number}.md`);
    for (const path of paths) current.bestiary.push({ name: path, path });
    // Every note takes a millisecond; none of them needs a read, so nothing else would interrupt the batch.
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 1));
    const index = CreatureIndex.forApp(current.app);
    let turns = 0;
    const timer = setInterval(() => { if (index.isPending()) turns += 1; }, 0);

    index.request(paths);
    await settled(index);
    clearInterval(timer);
    clock.mockRestore();

    expect(index.get(paths[399]!)).not.toBeUndefined();
    expect(turns).toBeGreaterThan(5);
  });

  it('does not resolve a note twice', async () => {
    const index = CreatureIndex.forApp(current.app);
    const read = vi.spyOn(current.app.vault, 'cachedRead');
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('re-reads a note when it changes and tells subscribers', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md']);
    await settled(index);
    const listener = vi.fn();
    index.subscribe(listener);

    current.frontmatter['Bestiary/Goblin.md']!.cr = 2;
    current.metadata.trigger('changed', new TFile('Bestiary/Goblin.md'));
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')?.fields.cr).toBe(2);
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the old entry readable while the new one resolves', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    current.files.set('Bestiary/Orc.md', '```statblock\nname: Orc\ncr: 3\n```');
    current.metadata.trigger('changed', new TFile('Bestiary/Orc.md'));
    expect(index.get('Bestiary/Orc.md')?.fields.cr).toBe('1/2');
    await settled(index);
    expect(index.get('Bestiary/Orc.md')?.fields.cr).toBe(3);
  });

  it('ignores changes to notes no token links', async () => {
    const index = CreatureIndex.forApp(current.app);
    const listener = vi.fn();
    index.subscribe(listener);
    current.metadata.trigger('changed', new TFile('Notes/Plain.md'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('forgets a statblock whose note is deleted or renamed', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md']);
    await settled(index);

    current.files.delete('Bestiary/Goblin.md');
    current.vault.trigger('delete', new TFile('Bestiary/Goblin.md'));
    current.files.delete('Bestiary/Orc.md');
    current.files.set('Monsters/Orc.md', '');
    current.vault.trigger('rename', new TFile('Monsters/Orc.md'), 'Bestiary/Orc.md');
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')).toBeNull();
    expect(index.get('Bestiary/Orc.md')).toBeNull();
  });

  it('re-reads every note once the bestiary settles after an update', async () => {
    vi.useFakeTimers();
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md']);
    await vi.runAllTimersAsync();
    expect(index.get('Bestiary/Goblin.md')?.fields.name).toBe('Goblin');

    current.bestiary.push({ name: 'Hobgoblin', path: 'Bestiary/Goblin.md' });
    current.workspace.trigger('fantasy-statblocks:bestiary:updated');
    current.workspace.trigger('fantasy-statblocks:bestiary:updated');
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();

    expect(index.get('Bestiary/Goblin.md')?.fields.name).toBe('Hobgoblin');
    expect(current.getBestiaryCreatures).toHaveBeenCalledTimes(2);
  });

  it('stops listening when released', () => {
    CreatureIndex.forApp(current.app);
    expect(current.workspace.count() + current.metadata.count() + current.vault.count()).toBeGreaterThan(0);
    CreatureIndex.release(current.app);
    expect(current.workspace.count() + current.metadata.count() + current.vault.count()).toBe(0);
  });
});
